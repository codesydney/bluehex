# Profile lifecycle: states, visibility, and who may write what

Spike for [#35](https://github.com/codesydney/bluehex/issues/35). The deliverable is a
decision plus a proof, not the production implementation — that is
[#14](https://github.com/codesydney/bluehex/issues/14).

Everything below was stood up against the local Supabase stack and exercised through
PostgREST as real signed-in users. The transcript is at the bottom.

## The decision, in one paragraph

Three independent axes, not one sequence. `status` (`pending` → `approved` / `rejected`)
is **admission control** — is this a real person, is the profile not spam — and it alone
decides whether anyone else can see the row. `verified` is **credential attestation** —
Bluehex checked the evidence — and it alone decides whether the badge shows. `certified`
stays what it already is: the practitioner's own claim, self-asserted and self-writable.
Practitioners edit their live row in place; an edit never unpublishes them, and an edit
to attested content silently drops the badge until Bluehex looks again.

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
| `approved` | **everyone, including anonymous** | `approve_practitioner()`, admin only |
| `rejected` | the owner (with the reason), and admins | `reject_practitioner()`, admin only |

`rejected` is **not terminal**. A rejected profile stays visible to its owner along with
`review_note`, the feedback that came with the rejection; the owner edits and an admin
re-approves. There is no separate "resubmit" transition, because there is nothing for it
to do — the row never left the admin queue.

Visibility is enforced by RLS policies on `select` and nowhere else. A `.eq("status",
"approved")` in the directory query is a suggestion; the policy is the control. Three
permissive policies, OR'd: anonymous and signed-in users see `approved`, a practitioner
additionally sees their own row in any state, an admin sees everything.

**Not decided here, on purpose:** a `draft` state (the submission form holds the draft
until it is submitted — no row, no state) and a `withdrawn` state. Self-removal is a
`delete` on your own row, which is the honest primitive and needs no machinery. If
losing the approval and verification history of someone who leaves and returns turns out
to matter, `withdrawn` is the answer then, and it is cheap to add — one enum value and
one transition. Adding it now would be defending a requirement nobody has yet.

## Who an admin is

A table: `public.admins (user_id)`, referencing `auth.users`. It carries **no grants at
all**, so it is invisible through the API — even to an admin, who gets `42501` asking for
it. The only reader is `private.is_admin()`, a `security definer` function in a schema
PostgREST does not expose.

Chosen over a JWT claim (via a custom access token hook) for one reason: **revocation is
immediate**. A claim baked into an access token stays true until that token expires, up
to an hour after the admin was removed. For the row that decides who can hand out the
badge, an hour of stale authority is the wrong failure mode. Second reason, smaller: an
auth hook has to be configured identically in `config.toml` and in the hosted project,
and configuration that lives in two places drifts silently.

The cost is a lookup per policy evaluation. Mitigated by wrapping the call as
`(select private.is_admin())`, which Postgres evaluates once per statement rather than
once per row.

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

Four layers. The first two are the ones `AGENTS.md` already demands; the third is forced
by a constraint that only shows up once you have admins; the fourth is what makes the
first three legible.

1. **Column grants.** `authenticated` gets `update (name, headline, location, bio,
   certified)` and `insert (user_id, name, headline, location, bio, certified)` — and
   nothing else. `status`, `verified`, `review_note` and the provenance columns are not
   in either list, so a `PATCH {"verified": true}` is refused with `42501` before any
   policy is consulted. `user_id` is insertable but not updatable, so a row cannot be
   handed to someone else. A column added later is unwritable until it is named, which
   fails closed.

2. **A `before update` trigger.** Pins every Bluehex-owned column to its `OLD` value for
   non-admin callers, and applies the badge-clearing rule above. This is the only place
   the invariant can be *stated* — a policy has no `OLD`. It is also what still holds if
   a later migration re-grants a column by accident, which the proof below tests
   directly by re-granting the columns and trying the write again.

   It pins silently rather than raising. The grants already reject the honest attempt
   with a clear 403; a backstop that throws would take down legitimate writes if it ever
   misfired.

3. **RPCs for the admin write path.** This is the part that is easy to miss:
   **PostgREST connects as `authenticated` for every signed-in user**, so column grants
   cannot tell an admin from a practitioner. Revoking `update (verified)` from
   `authenticated` revokes it from admins too. So admins do not `PATCH` the attestation
   columns at all — they call `approve_practitioner()`, `reject_practitioner()` and
   `set_practitioner_verified()`, `security definer` functions that check
   `private.is_admin()` first. Proved below: an admin `PATCH`ing `status` directly gets
   403, exactly like a practitioner would.

   Two things fall out of this for free. Approving and verifying are separate actions,
   which is what the ticket asked for — approval never sets `verified`. And the service
   role key is not needed for any of it, so the admin screen can be an ordinary
   signed-in client and no secret needs to exist in the app.

4. **RLS policies** for row visibility and own-row writes, as above.

### Why not the service role key

The obvious alternative: let the admin screen hold the secret key, bypass RLS, and write
`status` and `verified` directly. Rejected, and it is worth being precise about why,
because it looks like less work.

It does not remove the `admins` table — you still have to know who an admin is. It moves
where that check runs: out of Postgres and into a server action. The check that protects
the badge stops being enforced by the database and becomes application code that has to
be right on every path, which is the second authorization model `AGENTS.md` rules out
under **No ORM**.

The failure modes are asymmetric. A missing guard in one server action is a total
bypass — and both mechanisms above are decorative against it, since the trigger's
non-admin branch never fires for a role that is not `authenticated`. The same mistake
against the RPC is refused by Postgres. This is the column where failing open destroys
the only thing the directory sells.

It also has a cost the repo has already priced: no secret key is in this repo, and
adding one is a decision rather than a step. Taking this route puts an RLS-bypassing
credential into `.env.local` and into Vercel preview *and* production, so every preview
deployment carries it, plus the standing discipline that it is never imported by a client
component or anything one can reach.

The service role key is still right for operator work with no user in the loop — seeding
the first admin, backfills, a webhook or a cron job. That is the case `AGENTS.md` already
covers. It is not the admin screen, which has a signed-in human whose identity you want
on the row: `approved_by` comes from `auth.uid()` for free inside the RPC, and would have
to be passed in and trusted if the service key were doing the writing.

### The grant this design does not scope down

Be honest about the weak point, because it is the thing the service key would have
fixed. `execute` on the three admin RPCs is granted to **`authenticated`** — every
signed-in practitioner may call `approve_practitioner()`. Each one raises `42501` for a
non-admin, and the proof asserts it, but the privilege is granted broadly and then
filtered at runtime rather than never granted at all.

That is not a slip, it is the ceiling: PostgREST connects every signed-in user as the
same Postgres role, so *any* privilege granted to `authenticated` is granted to
everyone. Guarding at runtime is the only lever left. The service key does not beat this
on least privilege either — it swaps a broad grant of a precise capability (three named
actions) for a narrow grant of an unbounded one (a credential that can do anything to any
table). Neither is what least privilege actually asks for.

**The design that does ask for it is a distinct Postgres role.** PostgREST switches to
the role named in the JWT's `role` claim, so a custom access token hook could hand admins
`role: bluehex_admin`. Then the attestation column grants and the `execute` grants go to
that role alone, non-admins cannot call the functions at all — possibly cannot need them,
since column grants would now tell an admin apart on their own — and enforcement stays in
the database.

Not taken here, and not because it is wrong: it needs an auth hook configured identically
in `config.toml` and in the hosted project or it drifts silently, it reintroduces the
revocation lag that lost the JWT claim to the `admins` table, and a misfiring hook hands
someone admin. It also needs proving first — that Supabase permits a hook to overwrite
`role` at all is untested here. **If minimising what `authenticated` holds is the
priority, this is the route to spike, not the service key.**

## Provenance

`approved_at` / `approved_by` and `verified_at` / `verified_by`, set by the RPCs from
`auth.uid()` — so the record of who vouched for a profile is written by the same
statement that vouches for it, not by the caller.

Admin edits to a practitioner's *content* are not recorded, and should not be faked with
more columns. If it matters, the answer is an audit table over the whole row, and that is
its own ticket.

`review_note` is feedback **to the practitioner**, not an internal comment: it is on the
row, and the row is world-readable once approved. `approve_practitioner()` clears it for
that reason. Internal notes need somewhere else to live.

## Migration sketch

Not a migration yet, and deliberately so. The lifecycle columns below are settled; the
profile's own fields are not — [#9](https://github.com/codesydney/bluehex/issues/9) owns
what a profile contains, what a credential is, and what a profile URL looks like, and
`AGENTS.md` is explicit that no schema lands before the model it encodes is settled. The
first real migration should be this file's lifecycle half plus #9's field half, together.
`name`, `headline`, `location` and `bio` below are placeholders standing in for whatever
#9 decides, and `credentials` is absent entirely.

```sql
-- admin identity -----------------------------------------------------------
create schema private;
revoke all on schema private from public, anon, authenticated;

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- no grants: `admins` is not part of the API surface at all

create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;
-- A policy expression is evaluated as the CALLING role, so `authenticated` must
-- be able to execute this. Without the grant, every query on `practitioners`
-- fails with `42501 permission denied for function is_admin` and nothing in the
-- message points at the policy. What keeps it out of reach is the schema:
-- PostgREST exposes only the schemas it is configured with, and `private` is not
-- one of them.
revoke execute on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- the table ----------------------------------------------------------------
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

  -- Bluehex-writable, through the RPCs below and nothing else
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

-- privileges ---------------------------------------------------------------
-- Migrations run as `postgres`, whose default privileges give anon and
-- authenticated no read or write. Every grant here is load-bearing.
grant select on public.practitioners to anon, authenticated;
grant insert (user_id, name, headline, location, bio, certified)
  on public.practitioners to authenticated;
grant update (name, headline, location, bio, certified)
  on public.practitioners to authenticated;
grant delete on public.practitioners to authenticated;

-- policies -----------------------------------------------------------------
alter table public.practitioners enable row level security;

create policy practitioners_read_approved on public.practitioners
  for select to anon, authenticated
  using (status = 'approved');

create policy practitioners_read_own on public.practitioners
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy practitioners_read_all_admin on public.practitioners
  for select to authenticated
  using ((select private.is_admin()));

create policy practitioners_insert_own on public.practitioners
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy practitioners_update_own on public.practitioners
  for update to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()))
  with check ((select auth.uid()) = user_id or (select private.is_admin()));

create policy practitioners_delete_own on public.practitioners
  for delete to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

-- the guard ----------------------------------------------------------------
create function public.practitioners_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();

  if (select private.is_admin()) then
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

-- admin write path ---------------------------------------------------------
-- PostgREST connects as `authenticated` for every signed-in user, so column
-- grants cannot distinguish an admin. The admin write path is a function.
create function public.approve_practitioner(profile_id uuid)
returns public.practitioners
language plpgsql security definer set search_path = '' as $$
declare result public.practitioners;
begin
  if not (select private.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
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
revoke execute on function public.approve_practitioner(uuid) from public, anon;
grant execute on function public.approve_practitioner(uuid) to authenticated;
```

## Two things that cost time, worth writing down

**A policy's helper function must be executable by the calling role.** The Supabase
guidance to `revoke execute … from anon, authenticated` on a `security definer` helper
applies to functions the client calls *directly*. A helper used inside a policy is
evaluated as the caller, so revoking it breaks every query on the table — with
`42501 permission denied for function is_admin`, which names neither the table nor the
policy. Keep the helper in an unexposed schema and grant `execute`; the schema is what
makes it unreachable over the API, not the grant.

**Column-level `insert` grants also block the insert-time attack.** `POST` with
`{"status": "approved"}` is refused for the same reason the `PATCH` is, so there is no
window where a practitioner arrives pre-approved. Worth knowing that the two grant lists
differ by one column: `user_id` is insertable (you must claim your own row) and not
updatable (you cannot hand it to someone else).

## Proof

Run against the local stack, through PostgREST, as three real users — two practitioners
and one admin. 49 assertions, all passing. The script is not committed: it asserts
against a schema applied by hand, and when the real migration lands in #14 the proof
should land with it as a test rather than as a shell script.

```
== the admins table is not part of the API ================================
  PASS  even an admin cannot GET /admins                           403

== a practitioner creates their own profile ===============================
  PASS  alice inserts own row                                      201
  PASS    lands as pending                                         pending
  PASS    lands unverified                                         false
  PASS  bob inserts a row owned by alice                           403
  PASS  bob self-approves at insert time                           403

== visibility of a pending profile ========================================
  PASS  anonymous sees it                                          0
  PASS  another practitioner sees it                               1
  PASS    (that one row is bob's own)                              6cd3897d-…
  PASS  alice sees her own                                         1
  PASS  admin sees both                                            2

== the attack: a practitioner writes the columns Bluehex owns =============
  PASS  alice PATCHes {status: approved}                           403
  PASS  alice PATCHes {verified: true}                             403
  PASS  alice reassigns her row to bob                             403
  PASS  alice edits bob's row                                      200
  PASS    ...but matched no rows                                   0

== the admin write path ===================================================
  PASS  bob calls approve_practitioner                             403
  PASS  bob verifies himself via the RPC                           403
  PASS  admin approves alice                                       200
  PASS    status                                                   approved
  PASS    approved_by is the admin                                 da1e7532-…
  PASS    verified is untouched by approval                        false
  PASS  anonymous now sees the approved profile                    1
  PASS  admin verifies alice                                       200
  PASS    verified                                                 true

== an edit drops the badge without unpublishing ===========================
  PASS  alice edits bio (not attested)                             200
  PASS    still verified                                           true
  PASS    still approved                                           approved
  PASS  alice claims certification (attested)                      200
  PASS    badge dropped                                            false
  PASS    still published                                          approved
  PASS    verified_by cleared                                      null

== an admin edits someone else's profile ==================================
  PASS  admin re-verifies alice                                    200
  PASS  admin fixes alice's bio                                    200
  PASS    the edit landed                                          tidied by Bluehex
  PASS  admin corrects the name (attested)                         200
  PASS    badge survives an admin edit                             true
  PASS  admin PATCHes status directly                              403

== the backstop: what if a later migration re-grants the columns? =========
  PASS  grant restored, alice PATCHes both                         200
  PASS    trigger pinned verified                                  false
  PASS  bob PATCHes his pending row                                200
  PASS    trigger pinned status                                    pending
  PASS    trigger pinned verified                                  false

== rejection, and self-removal ============================================
  PASS  admin rejects bob                                          200
  PASS    bob still sees his own row                               rejected
  PASS    and reads the reason                                     no evidence supplied
  PASS    anonymous sees nothing                                   0
  PASS  alice removes her own listing                              200
  PASS    it is gone                                               0

  49 passed, 0 failed
```

The two assertions that matter most are the ones a review would wave through: a
practitioner `PATCH`ing themselves `{"verified": true}` is refused, and it is *still*
refused after the column grant is put back by hand. A policy that looks right and permits
the write is the failure mode here, so the assertion is the point.

## What this unblocks, and what it does not

- **[#14](https://github.com/codesydney/bluehex/issues/14)** can be built: the states,
  the transitions and the write path are settled.
- **[#9](https://github.com/codesydney/bluehex/issues/9)** still owns the field list,
  the credential model, and identity/slugs. The first migration waits on it.
- **[#10](https://github.com/codesydney/bluehex/issues/10)** decides what `approved` and
  `verified` actually assert about a person. Nothing above depends on the answer — it
  changes the admin's checklist, not the schema.
