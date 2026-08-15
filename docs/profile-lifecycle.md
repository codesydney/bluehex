# Profile lifecycle: states, visibility, and who may write what

> **Superseded. Retained as evidence, not as a contract.**
>
> Everything durable in this document has moved:
>
> - The decision — admins as a Postgres role stamped by an access token hook, the
>   alternatives rejected, the revocation lag and the hook-ordering rule →
>   [`docs/adr/0001-admins-are-a-postgres-role.md`](adr/0001-admins-are-a-postgres-role.md)
> - The model — what a profile contains, who owns it, what the badge attests to, the DDL
>   and its grants → [`docs/spec/profile-and-credentials.md`](spec/profile-and-credentials.md)
> - The vocabulary → [`CONTEXT.md`](../CONTEXT.md)
>
> **Do not implement from this file.** Its schema is stale in several respects: `verified`
> is no longer a column on `practitioners` but sits on each credential row with the badge
> derived; `certified` is not stored at all; `status` has gained `withdrawn`; `user_id` is
> nullable with `on delete set null`; and contact details live in a table of their own.
>
> What is left is the proof transcript — 46 assertions run against the local stack on
> 2026-08-15 — kept exactly as it ran, including where it names columns that have since
> moved. It is the record that these invariants were actually tested rather than reasoned
> about, and rewriting it would make it worthless as evidence.
>
> **Delete this file when those assertions land as committed tests alongside the first
> migration.** Running tests are better evidence than a pasted terminal dump, and at that
> point it is dead weight.

Spike for [#35](https://github.com/codesydney/bluehex/issues/35). The deliverable is a
decision plus a proof, not the production implementation — that is
[#14](https://github.com/codesydney/bluehex/issues/14).

Everything below was stood up against the local Supabase stack and exercised through
PostgREST as real signed-in users. Two passes: the first put the admin check inside
`security definer` functions, the second replaced it with a Postgres role of its own.
The second is the recommendation, and the first is kept at the end because the reasoning
that got there is the reason to trust it.

## The decision, in one paragraph

Three independent axes, not one sequence. `status` (`pending` → `approved` / `rejected`)
is **admission control** — is this a real person, is the profile not spam — and it alone
decides whether anyone else can see the row. `verified` is **credential attestation** —
Bluehex checked the evidence — and it alone decides whether the badge shows. `certified`
stays what it already is: the practitioner's own claim, self-asserted and self-writable.
Practitioners edit their live row in place; an edit never unpublishes them, and an edit
to attested content silently drops the badge until Bluehex looks again. Admins are not
signed-in users with a flag: they connect to Postgres **as a different role**, so the
privileges that protect the badge are held by that role and by nothing else.

## Naming: `AGENTS.md` was right, with one word changed

The director's sketch read `pending | approved | verified` as one sequence. It cannot be,
for the reason `AGENTS.md` already gives: fold the badge into the lifecycle and
"un-verify this profile" also unpublishes it, and there is no state left for *published
but not vouched for* — which is the majority of the directory by design, since anyone in
the community may publish and Bluehex alone marks Verified.

So the axes stay separate. The one change to `AGENTS.md` is the first state's name:
`registered` becomes **`pending`**. Not cosmetic. `registered` describes something the
practitioner did once and cannot do again; `pending` describes what Bluehex owes, and a
profile can re-enter it — a rejected profile that is resubmitted, or an approved profile
an admin pulls back for review. A state you can re-enter needs a name that survives
re-entry.

## The states

| state | who can see the row | how you get here |
| --- | --- | --- |
| `pending` | the owner, and admins | insert; the column grants make it the only insertable state |
| `approved` | **everyone, including anonymous** | an admin, through `approve_practitioner()` |
| `rejected` | the owner (with the reason), and admins | an admin, through `reject_practitioner()` |

`rejected` is **not terminal**. A rejected profile stays visible to its owner along with
`review_note`, the feedback that came with the rejection; the owner edits and an admin
re-approves. There is no separate "resubmit" transition, because there is nothing for it
to do — the row never left the admin queue.

Visibility is enforced by RLS policies on `select` and nowhere else. A `.eq("status",
"approved")` in the directory query is a suggestion; the policy is the control.

**Not decided here, on purpose:** a `draft` state (the submission form holds the draft
until it is submitted — no row, no state) and a `withdrawn` state. Self-removal is a
`delete` on your own row, which is the honest primitive and needs no machinery. If
losing the approval and verification history of someone who leaves and returns turns out
to matter, `withdrawn` is the answer then, and it is cheap to add — one enum value and
one transition. Adding it now would be defending a requirement nobody has yet.

## Three tiers, and ordinary signup

Sign-up is completely ordinary and stays that way: a practitioner registers through
`/auth/v1/signup`, GoTrue creates the user, and their token says `role: authenticated`
exactly as it would in any Supabase project. There is no separate admin sign-up, no
invite flow to build, and no second identity system.

| tier | Postgres role | how you get it |
| --- | --- | --- |
| public | `anon` | no token |
| a practitioner | `authenticated` | sign up; the default for everybody |
| Bluehex | `bluehex_admin` | your `user_id` is in `public.admins`, so the access token hook stamps the role |

`bluehex_admin` is granted `authenticated`, so an admin keeps everything a practitioner
can do — their own profile included — and gains the attestation privileges on top. It is
one level above, not a parallel world.

## Who an admin is, and how the role gets onto the token

Three pieces:

1. **`public.admins (user_id)`**, referencing `auth.users`. It carries no grants for
   `anon`, `authenticated` or `bluehex_admin`, so it is invisible through the API — even
   an admin gets `42501` asking for it. Its only reader is the hook.
2. **A custom access token hook**, `public.custom_access_token_hook(event jsonb)`, run by
   GoTrue as `supabase_auth_admin` when a token is minted. If the user is in `admins` it
   rewrites one claim: `role` → `bluehex_admin`.
3. **The role itself**, `create role bluehex_admin nologin` with
   `grant bluehex_admin to authenticator`. PostgREST logs in as `authenticator` and
   switches to the role named in the token's `role` claim; it can only switch to roles it
   is a member of, so that grant is what makes the whole thing work.

**Proved, because it was the load-bearing assumption:** Supabase does permit the hook to
overwrite `role`, GoTrue mints the token without complaint, PostgREST honours it, and
`aud` and `sub` are untouched — so `auth.uid()` still resolves to the person, and
provenance still records who approved what.

### Why a role rather than a flag checked at runtime

Because it is the only design where the privileges that protect the badge are **not
granted to everyone and then filtered**. PostgREST connects every signed-in user as the
same Postgres role, so anything granted to `authenticated` is granted to every
practitioner. With the role:

- `execute` on the three admin functions goes to `bluehex_admin` alone. A practitioner
  calling `approve_practitioner()` gets `42501 permission denied for function` — they
  cannot reach it to be turned away.
- `update (status, verified, review_note, approved_*, verified_*)` goes to
  `bluehex_admin` alone.
- `select (approved_by, verified_by, verified_at)` goes to `bluehex_admin` alone. Nobody
  else in the database can read who vouched for a profile.
- The `private` schema, the `private.is_admin()` helper, the `usage` grant on that schema
  and the `execute` grant on that function all **disappear**, along with every
  `security definer` in the write path. Fewer moving parts, and none of them privileged.

### The cost, measured rather than asserted

**Revocation lags by the life of the access token.** Removing a row from `admins` does
not touch tokens already issued. The proof asserts exactly this: after the delete, the
old token still performs an admin write; on the next refresh the role is gone and the
same call is refused. So revocation takes effect within one refresh interval (an hour by
default, and `[auth] jwt_expiry` is the dial). If a compromised admin ever needs to be
cut off *now*, the lever is to invalidate their sessions — not to edit the table and hope.

**The hook is configuration that must match in two places.** `[auth.hook.custom_access_token]`
in `config.toml` for local, and the Auth Hooks setting in the hosted project. This is the
config drift that argued against JWT claims in the first pass, and it is still real — it
is now bought rather than avoided, in exchange for the privilege scoping above.

**And it fails loudly, which is the good news.** Enabling the hook without the function
present takes down every sign-in and sign-up with
`500 unexpected_failure: Error running hook URI`. Verified by renaming the function out
from under a live stack. Two consequences worth stating as rules:

- The `config.toml` change and the migration that creates the function **must land in the
  same commit**, and the migration must run before the config is enabled anywhere.
- Enabling the hook on the hosted project is a step that belongs with the deploy of that
  migration, not before it. `config.toml` in this repo is therefore **still unchanged** —
  the hook line lands with the migration in #14, not with this spike.

## Do practitioners edit the live row? The question dissolves

The ticket framed two shapes: edit-in-place with a status kick-back, or proposed changes
as separate records that an admin promotes. Both exist to answer "how do we stop
unreviewed content going public" — and that question only has force if `status` is
carrying the trust. It is not; `verified` is.

So: **edit in place, no kick-back, and clear `verified` instead.**

- An edit to `bio`, `headline` or `location` changes nothing else. The profile stays up.
- An edit to `name` or `certified` — the content the attestation is *about* — clears
  `verified`, `verified_at` and `verified_by` in the same statement. The badge goes; the
  profile stays up and stays findable.
- `status` is untouched either way. Editing your own profile can never unpublish you.

This is strictly better than the kick-back on the axis the ticket worried about — the
public profile neither disappears nor goes stale — and it costs a second table and a
merge step less than the propose-then-approve shape. Recommend the second shape only if
and when someone actually needs a published profile and a pending edit to coexist as
different content, which is not a problem the directory has today.

**The accepted risk, stated plainly:** an approved practitioner can edit their bio to
something abusive and it is public immediately, because approval is not re-run. The
mitigation is that an admin can move the row back to `pending` or to `rejected` at any
time, which takes it down. A report path is a later ticket, not a schema question. The
alternative — re-approving every typo fix — buys very little and costs the directory its
freshness.

## The mechanism

Four layers, and with the role in place none of them needs a privileged function.

1. **Column grants, on read as well as write.** `authenticated` may write
   `name, headline, location, bio, certified` and nothing else, so a
   `PATCH {"verified": true}` is refused with `42501` before any policy is consulted.
   `user_id` is insertable but not updatable, so a row cannot be handed to someone else.
   On the read side `anon` gets only the columns a directory card displays — no
   `user_id`, no provenance — and `authenticated` gets those plus what an owner needs to
   find and understand their own row (`user_id`, `status`, `review_note`).

2. **A `before update` trigger.** Pins every Bluehex-owned column to its `OLD` value
   unless the connected role is `bluehex_admin` (or an operator role), and applies the
   badge-clearing rule. This is the only place the invariant can be *stated* — a policy
   has no `OLD`. It is what still holds if a later migration re-grants a column by
   accident, which the proof tests directly by re-granting the columns and trying the
   write again. It is no longer `security definer` and reads no table: admin-ness is now
   a property of the connected role, which is exactly what a trigger can see.

   It pins silently rather than raising. The grants already reject the honest attempt
   with a clear 403; a backstop that throws would take down legitimate writes if it ever
   misfired.

3. **RLS policies** for row visibility. Anonymous and signed-in users see `approved`; a
   practitioner also sees their own row in any state; `bluehex_admin` gets one
   `for all … using (true)` policy — no function call, no helper, the role *is* the check.

4. **RPCs for the admin actions**, granted to `bluehex_admin` only. They are now plain
   `security invoker` functions with no authorization logic inside them at all — Postgres
   refuses the call to anyone else. They earn their place by making approval atomic and
   by writing provenance from `auth.uid()` rather than from whatever the caller passes.
   An admin *can* also `PATCH` `status` directly, since the column grant allows it; the
   RPC is the path that records who did it.

## Provenance

`approved_at` / `approved_by` and `verified_at` / `verified_by`, set by the RPCs from
`auth.uid()` — so the record of who vouched for a profile is written by the same
statement that vouches for it. Only `bluehex_admin` can read these columns.

Admin edits to a practitioner's *content* are not recorded, and should not be faked with
more columns. If it matters, the answer is an audit table over the whole row, and that is
its own ticket.

`review_note` is feedback **to the practitioner**, not an internal comment: the owner can
read it, and it stays on a row that becomes world-readable once approved.
`approve_practitioner()` clears it for that reason. Internal notes need somewhere else to
live.

## Migration sketch

Not a migration yet, and deliberately so. The lifecycle columns below are settled; the
profile's own fields are not — [#9](https://github.com/codesydney/bluehex/issues/9) owns
what a profile contains, what a credential is, and what a profile URL looks like, and
`AGENTS.md` is explicit that no schema lands before the model it encodes is settled. The
first real migration should be this file's lifecycle half plus #9's field half, together —
and it must carry the `config.toml` hook line with it, per the rule above.
`name`, `headline`, `location` and `bio` below are placeholders standing in for whatever
#9 decides, and `credentials` is absent entirely.

```sql
-- the role ------------------------------------------------------------------
-- PostgREST logs in as `authenticator` and switches to the role named in the
-- token's `role` claim. It can only switch to roles it is a member of.
create role bluehex_admin nologin;
grant bluehex_admin to authenticator;
grant authenticated to bluehex_admin;   -- an admin is also an ordinary user
grant usage on schema public to bluehex_admin;

-- admin identity -------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- no grants to anon/authenticated/bluehex_admin: not part of the API surface
grant select on public.admins to supabase_auth_admin;
create policy admins_read_auth_admin on public.admins
  for select to supabase_auth_admin using (true);

-- the hook -------------------------------------------------------------------
-- Runs inside GoTrue as `supabase_auth_admin` when a token is minted.
-- REQUIRES `[auth.hook.custom_access_token]` in config.toml and the matching
-- setting in the hosted project. Enabling it without this function present
-- takes down every sign-in with a 500.
create function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
begin
  if exists (
    select 1 from public.admins a
     where a.user_id = (event->>'user_id')::uuid
  ) then
    event := jsonb_set(event, '{claims,role}', '"bluehex_admin"');
  end if;
  return event;
end;
$$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated, bluehex_admin;

-- the table ------------------------------------------------------------------
create type public.practitioner_status as enum ('pending', 'approved', 'rejected');

create table public.practitioners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,

  -- practitioner-writable; placeholders for #9
  name text not null,
  headline text,
  location text,
  bio text,
  certified boolean not null default false,

  -- bluehex_admin only
  status public.practitioner_status not null default 'pending',
  verified boolean not null default false,
  review_note text,
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  verified_at timestamptz,
  verified_by uuid references auth.users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practitioners_user_id_idx on public.practitioners (user_id);
create index practitioners_approved_idx on public.practitioners (status)
  where status = 'approved';

-- privileges -----------------------------------------------------------------
-- Migrations run as `postgres`, whose default privileges give anon and
-- authenticated no read or write. Every grant here is load-bearing.

-- Read is column-scoped too. The public never needed `user_id` or provenance.
grant select (id, name, headline, location, bio, certified, verified, created_at)
  on public.practitioners to anon;
grant select (id, user_id, name, headline, location, bio, certified, verified,
              status, review_note, created_at, updated_at)
  on public.practitioners to authenticated;

grant insert (user_id, name, headline, location, bio, certified)
  on public.practitioners to authenticated;
grant update (name, headline, location, bio, certified)
  on public.practitioners to authenticated;
grant delete on public.practitioners to authenticated;

-- the attestation columns, and the provenance behind them, exist for one role
grant select, delete on public.practitioners to bluehex_admin;
grant update (name, headline, location, bio, certified,
              status, verified, review_note,
              approved_at, approved_by, verified_at, verified_by)
  on public.practitioners to bluehex_admin;

-- policies -------------------------------------------------------------------
alter table public.practitioners enable row level security;

create policy practitioners_read_approved on public.practitioners
  for select to anon, authenticated
  using (status = 'approved');

create policy practitioners_read_own on public.practitioners
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- no function call, no helper schema: the role is the check
create policy practitioners_admin_all on public.practitioners
  for all to bluehex_admin
  using (true) with check (true);

create policy practitioners_insert_own on public.practitioners
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy practitioners_update_own on public.practitioners
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy practitioners_delete_own on public.practitioners
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- the guard ------------------------------------------------------------------
create function public.practitioners_guard()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();

  if current_user in ('bluehex_admin', 'service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  new.status      := old.status;
  new.verified    := old.verified;
  new.review_note := old.review_note;
  new.approved_at := old.approved_at;
  new.approved_by := old.approved_by;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;
  new.user_id     := old.user_id;

  -- an edit to attested content invalidates the attestation; the badge drops,
  -- the profile stays up, `status` is untouched
  if new.certified is distinct from old.certified
     or new.name is distinct from old.name then
    new.verified    := false;
    new.verified_at := null;
    new.verified_by := null;
  end if;

  return new;
end;
$$;

create trigger practitioners_guard
  before update on public.practitioners
  for each row execute function public.practitioners_guard();

-- admin write path -----------------------------------------------------------
-- `security invoker`, and no authorization logic inside: Postgres refuses the
-- call to anyone who is not bluehex_admin.
create function public.approve_practitioner(profile_id uuid)
returns public.practitioners language plpgsql as $$
declare result public.practitioners;
begin
  update public.practitioners
     set status = 'approved',
         review_note = null,   -- approved rows are world-readable
         approved_at = now(),
         approved_by = (select auth.uid())
   where id = profile_id
   returning * into result;
  if not found then
    raise exception 'no such profile' using errcode = 'P0002';
  end if;
  return result;
end;
$$;
-- ...and reject_practitioner(uuid, text) and
--    set_practitioner_verified(uuid, boolean) to the same shape.

-- Functions in `public` are executable by PUBLIC by default. Revoke first.
revoke execute on function public.approve_practitioner(uuid)
  from public, anon, authenticated;
grant execute on function public.approve_practitioner(uuid) to bluehex_admin;
```

## Things that cost time, worth writing down

**Column-scoped `select` means `select *` stops working, and that is the point.**
`GET /practitioners` with no `select=` is refused, because PostgREST asks for every
column. Every read must name its columns. The same applies to filters: PostgREST
translates `?approved_by=not.is.null` into a `where` clause, and Postgres checks column
privileges on `where` too, so anonymous callers cannot filter on a column they cannot
read either. A column added later is unreadable until it is named — fails closed, same
as the update grants.

**An RLS policy can filter on a column the caller may not select.** The public read
policy is `using (status = 'approved')` and `anon` has no `select` privilege on `status`.
It works: policy expressions are not subject to the caller's column privileges. Asserted
in the proof, because assuming it the other way would have pushed the design towards a
view for no reason.

**PostgREST answers `401` for `anon` and `403` for a signed-in caller** on the same
`permission denied`. Do not read the status code as the authorization outcome.

**Enabling the hook without the function is a hard outage.** Every sign-in and sign-up
returns `500 unexpected_failure`. The config change and the migration are one change.

**A `security definer` helper used inside a policy must be executable by the calling
role.** This bit the first pass: the Supabase guidance to `revoke execute … from
authenticated` applies to functions the client calls *directly*, and a helper used in a
policy is evaluated as the caller — so revoking it breaks every query on the table with
`42501 permission denied for function is_admin`, which names neither the table nor the
policy. Moot in the recommended design, which has no such helper, and recorded because
the first pass looked correct and was not.

## Proof

Run against the local stack, through PostgREST, as three real users — two practitioners
and one admin, with one of them arriving through the ordinary `/auth/v1/signup` form.
46 assertions, all passing. The script is not committed: it asserts against a schema
applied by hand, and when the real migration lands in #14 the proof should land with it
as a test rather than as a shell script.

```
== signup is ordinary; the role claim is the only thing the hook touches ==
  PASS  alice signs herself up and gets a session                  authenticated
  PASS  bob too                                                    authenticated
  PASS    alice arrived through /auth/v1/signup                    f31f92fc-…
  PASS  admin's next token carries the role                        bluehex_admin
  PASS    and still identifies the same person                     8245bc15-…
  PASS    aud is untouched                                         authenticated

== the admins table is not part of the API ================================
  PASS  even an admin cannot GET /admins                           403

== a practitioner creates their own profile ===============================
  PASS  alice inserts own row                                      201
  PASS    lands as pending                                         pending
  PASS  bob self-approves at insert time                           403

== reads are column-scoped, not just writes ===============================
  PASS  anonymous SELECT *                                         401
        permission denied for table practitioners
  PASS  anonymous asks for user_id                                 401
  PASS  anonymous asks for approved_by                             401
  PASS  anonymous filters on approved_by                           401
  PASS  anonymous asks for the public columns                      200
  PASS    and the RLS filter still ran on a column it cannot read  0
  PASS  alice reads her own status                                 pending
  PASS  alice asks for approved_by                                 403
  PASS  admin reads approved_by                                    200

== the attack: a practitioner writes the columns Bluehex owns =============
  PASS  alice PATCHes {status: approved}                           403
  PASS  alice PATCHes {verified: true}                             403
  PASS  alice reassigns her row to bob                             403

== the scope-down: the RPCs are out of reach entirely =====================
  PASS  alice calls approve_practitioner                           403
        permission denied for function approve_practitioner
  PASS  bob calls set_practitioner_verified                        403

== the admin write path ===================================================
  PASS  admin approves alice                                       200
  PASS    status                                                   approved
  PASS    approved_by is the admin                                 8245bc15-…
  PASS    verified untouched by approval                           false
  PASS  anonymous now sees the approved profile                    1
  PASS  admin verifies alice                                       200
  PASS    verified                                                 true

== an edit drops the badge without unpublishing ===========================
  PASS  alice edits bio (not attested)                             200
  PASS    still verified                                           true
  PASS  alice claims certification (attested)                      200
  PASS    badge dropped                                            false
  PASS    still published                                          approved

== an admin edits someone else's profile ==================================
  PASS  admin corrects the name (attested)                         200
  PASS    badge survives an admin edit                             true
  PASS  admin PATCHes status directly                              200
  PASS    it lands (no RPC needed)                                 approved

== the backstop: what if a later migration re-grants the columns? =========
  PASS  grant restored, alice PATCHes both                         200
  PASS    trigger pinned verified                                  false
  PASS    trigger pinned status                                    approved

== revocation lag: the cost of carrying authority in a token =============
  PASS  removed from admins, old token still works                 200
        (this is the lag — the token is valid until it expires)
  PASS  on refresh the role is gone                                authenticated
  PASS    and the RPC is out of reach again                        403

  46 passed, 0 failed
```

The assertions that matter most are the ones a review would wave through: a practitioner
`PATCH`ing themselves `{"verified": true}` is refused, it is *still* refused after the
column grant is put back by hand, and a practitioner cannot so much as call the approval
function. A policy that looks right and permits the write is the failure mode here, so
the assertion is the point.

## Rejected: the service role key

The obvious alternative — let the admin screen hold the secret key, bypass RLS, and write
`status` and `verified` directly. It looks like less work and it is worth being precise
about why it was not taken.

It does not remove the `admins` table; you still have to know who an admin is. It moves
where that check runs: out of Postgres and into a server action. The check that protects
the badge stops being enforced by the database and becomes application code that has to
be right on every path — the second authorization model `AGENTS.md` rules out under
**No ORM**.

The failure modes are asymmetric. A missing guard in one server action is a total bypass,
and both mechanisms above are decorative against it, since the trigger's non-admin branch
never fires for a role that is not `authenticated`. The same mistake against the role
design is refused by Postgres.

On least privilege specifically — the reason it came up — it does not even win: it swaps
a broad grant of a precise capability (three named actions) for a narrow grant of an
unbounded one (a credential that can do anything to any table). The role design is the
one that actually scopes down, because the capability is *both* precise and held by a
role that practitioners do not have.

It also has a cost the repo has already priced: no secret key is in this repo, and adding
one is a decision rather than a step. It would put an RLS-bypassing credential into
`.env.local` and into Vercel preview *and* production, so every preview deployment
carries it, plus the standing discipline that it is never imported by a client component
or anything one can reach.

The service role key remains right for operator work with no user in the loop — seeding
the first admin, backfills, a webhook or a cron job. That is the case `AGENTS.md` already
covers. It is not the admin screen, which has a signed-in human whose identity belongs on
the row.

## Superseded: the first pass, `security definer` and `private.is_admin()`

Recorded because it is what a reasonable person writes first, and because the second pass
only looks obvious afterwards.

The first design kept everyone on `authenticated` and made admin-ness a runtime check: a
`private.is_admin()` helper reading the `admins` table, called from the RLS policies, the
trigger and three `security definer` RPCs that each raised `42501` for a non-admin. It
worked — 49 assertions, same behaviour — and it is a legitimate design if a custom access
token hook is unavailable.

What was wrong with it was not correctness but privilege. `execute` on all three admin
RPCs had to be granted to **`authenticated`**, so every signed-in practitioner could call
`approve_practitioner()` and be turned away by a check inside the function rather than by
Postgres. The helper had to be executable by `authenticated` too, and the write path ran
through three `security definer` functions. Broad grants, filtered at runtime, with
privileged functions doing the filtering.

Its one advantage is the one the recommended design pays for: **revocation is immediate**,
because the check reads a table on every statement rather than trusting a claim minted up
to an hour ago. If the badge ever needs cutting off faster than a token refresh, that is
the trade to revisit — and the two are not exclusive, since the trigger could read
`admins` as well as checking the role.

## What this unblocks, and what it does not

- **[#14](https://github.com/codesydney/bluehex/issues/14)** can be built: the states,
  the transitions, the roles and the write path are settled. It carries the `config.toml`
  hook line and the hosted-project Auth Hook setting with it.
- **[#9](https://github.com/codesydney/bluehex/issues/9)** still owns the field list, the
  credential model, and identity/slugs. The first migration waits on it. Note that a
  credentials child table needs its own column grants and its own badge-clearing trigger —
  the attestation is about the credentials, and they will not be on this row.
- **[#10](https://github.com/codesydney/bluehex/issues/10)** decides what `approved` and
  `verified` actually assert about a person. Nothing above depends on the answer — it
  changes the admin's checklist, not the schema.
