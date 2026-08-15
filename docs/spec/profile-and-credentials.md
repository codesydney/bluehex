# Profile and credential model

The technical design for [#9](https://github.com/codesydney/bluehex/issues/9) — the
blocker on the first migration. Built inline during a grill-spec session.

Binding context, already settled: `docs/profile-lifecycle.md` (spike #35) owns the
lifecycle, the roles and the write path, and every claim in it was proved against the
local stack. `CONTEXT.md` owns the vocabulary. This document owns what a profile
*contains* and how ownership works.

## System architecture

### Ownership: a profile may exist before its owner does

**Decided.** `user_id` is **nullable**. Two ways a profile comes into existence, and
they are not symmetric:

| | who creates it | `user_id` at creation |
| --- | --- | --- |
| **Self-service** — the normal path | the practitioner, signed in | their own account, always |
| **Curated intake** — the bootstrap | Bluehex | null; the profile is unclaimed |

A practitioner **cannot** create an unclaimed profile. This needs no new mechanism:
the insert policy is already `with check (auth.uid() = user_id)`, so a signed-in user
can only insert a row they own, and `null` fails that check. Only `bluehex_admin` can
write a row with no owner.

Three properties fall out for free, which is why this shape was chosen over the
alternatives:

- **`unique (user_id)` still means one profile per account.** Postgres allows many
  nulls in a unique index, so any number of profiles can be unclaimed while no
  account can have two.
- **Unclaimed profiles are invisible and unwritable to every practitioner.**
  `auth.uid() = user_id` evaluates to null, not true, when `user_id` is null — so the
  owner policies exclude them without a single extra clause. It fails closed.
- **An unclaimed profile can still be `approved` and publicly visible**, which is the
  entire point of curated intake: the directory fills up before self-service ships.

**Rejected: creating an account for each curated practitioner at intake** so that
`user_id` could stay `not null`. It would have deleted the claim path entirely, which
is genuinely attractive, but it means making accounts for people who did not ask for
one. Not worth the surface it saves.

**Rejected: `user_id not null` with curated profiles staying in the typed array.** The
directory would then have two sources during the whole of the transition, and #35's
schema could not seed the profiles that exist today.

### Claiming: an admin assigns the owner

**Decided.** An unclaimed profile gains its owner by an admin setting `user_id` — an ordinary `PATCH`, with no RPC in the path. `practitioners_guard` stamps `owner_assigned_at/by` from `auth.uid()` on any change to `user_id`, so the provenance is written whether or not the caller thought about it.

That is a deliberate reversal of an earlier draft, which put the claim behind `assign_profile_owner()`. An RPC is bypassable by anyone holding the `update` grant, so it recorded provenance only for callers who chose to use it; the trigger records it for everyone. The RPC was doing no other work.

**A profile cannot change owners.** `user_id` has three transitions and the guard refuses one of them outright:

| transition | meaning | verdict |
| --- | --- | --- |
| `null → A` | claiming an unclaimed profile | legal, and clears the badge |
| `A → null` | the account was deleted, or an admin unassigns | legal, and forces `withdrawn` |
| `A → B` | — | **refused** |

This is a state machine, not a permission. A profile is a record *about a person*, and there is no story in which the record about one person legitimately becomes another person's account's. Treating it as a privilege to withhold leads to warning dialogs and audit columns defending an operation that should not be expressible; refusing it in the trigger costs four lines and holds for admins too.

A mis-assignment is still recoverable without database access: unassign (`A → null`, which withdraws the profile while its ownership is in question), then claim it to the right account.

### The claim is checked against the contact email

**Decided.** An unclaimed profile is claimed by matching the claimer's **verified** account email against `practitioner_contacts.contact_email` — the address the practitioner actually replied from during curated intake.

No new column: requiring a contact row at profile creation means Bluehex already recorded that address, and it is already the one they corresponded with. An earlier draft proposed a separate `claim_email`; two email columns identical in almost every row is the "two representations of one fact that can disagree" this document rejects `certified` for.

The reason it works as a lock is that it is not editable by the person who wants to claim — an unclaimed profile has no owner, so every owner policy evaluates to null and only admins can touch it at all. What that leaves is an admin editing the address, so **changing `contact_email` while the profile is unclaimed clears verification**, the same way a rename does. See Triggers.

**Known limitation: GitHub OAuth returns a `no-reply` address**, which can never match. Those practitioners claim by signing in with magic link instead, or an admin overrides — and the override is exactly where social engineering comes back, so it is a human check rather than a mechanism.

**Deferred: practitioner self-claim.** The "we have a profile for you" prompt after sign-up. The matching logic is now specified, so what remains is the prompt and the flow rather than the hard part. Not now, because curated intake is a bootstrap: a handful of profiles, all of them already getting a human's attention during verification.

**Gate:** revisit when either is true — **(a)** an unclaimed profile exists that Bluehex did not write, or **(b)** more than ten profiles are unclaimed at once. Either means intake has outgrown the bootstrap and the admin step stops being a minute's work.

## Credentials

### One entity, a child table, and deliberately narrow

**Decided.** A credential is a row in `practitioner_credentials`, a child of the
profile. Claude Certifications and Anthropic Academy certificates are the *same*
entity distinguished by `source` — both come from Anthropic, both arrive through
Skilljar, both are evidenced by a share URL, and both are checked by the same human
doing the same thing. They differ in weight, and weight is a property rather than a
type.

`source` is **`text` with a check constraint, not an enum**. This is the axis that
actually moves: Anthropic will ship new credential types, and widening a check
constraint is one line where adding an enum value is a migration with awkward
transactional rules. `status` stays an enum — it grew once, to add `withdrawn`, and that
is the kind of growth a deliberate migration should announce rather than absorb quietly.

**A child table rather than `jsonb`,** because credentials are what the badge attests
to. They need their own grants and their own trigger, and a `jsonb` column would make
the badge-clearing rule diff two documents while making every credential writable
whenever any of them is.

### Not generalised to other kinds of qualification

**Decided.** A university degree, or any non-Anthropic certification, is not a
credential and does not go in this table. If it is ever wanted it is a **sister
feature** with its own table.

The reason is the badge rather than the schema. `verified` means "Bluehex checked the
credentials on this profile". Put a degree in the same table and that one boolean
silently starts asserting that Bluehex checked a university registrar — a different
check, by different people, against different evidence. The badge is the product, so
widening what it covers by accident is the expensive mistake. Positioning is also
decided: Claude and Anthropic focused for roughly the next two years.

**Deferred: what the badge means once a sister feature exists.** One profile-level
boolean cannot say "Claude credentials checked" and "degree checked" separately. Not a
problem today, and not worth a second column now.

**Gate:** the first sister-concept table. If non-Claude qualifications are ever built,
`verified` must be re-read before that work starts — not after.

### Consequence: the guard trigger from #35 is incomplete

Moving credentials off the profile row moves the attested content off the row the
guard trigger watches. `docs/profile-lifecycle.md` clears `verified` when `name` or
`certified` changes; with a child table, **adding or editing a credential would not
clear the badge**, which is the exact failure the rule exists to prevent.

So the child table needs its own trigger. **Superseded in part by the decision below to
verify per credential:** with `verified` living on the credential row, that trigger is an
ordinary `before update` on its own row — #35's pattern exactly, no privileged function.

The privileged function did not disappear, it changed direction. `name` is still attested
and still lives on the parent, so a rename must clear verification on every credential —
parent to child, and a practitioner has no privilege to write `verified` there. That is
`practitioners_rename_clears_credentials`, one of the two `security definer` functions in
the design (the other is `withdraw_profile()`), and it only ever sets the flag false.

### Evidence is a URL, and only a URL

**Decided.** `evidence_url text`, nullable, on the credential row. The practitioner
pastes their Skilljar certificate or share URL; a human at Bluehex opens it, reads the
name on it, and sets `verified`. Nullable because a working-towards credential has no
evidence yet — and an in-progress credential is inherently unverifiable, so the badge
attests to earned credentials only.

Three things deliberately **not** built, recorded so the argument does not have to be
had twice:

- **No file upload.** Screenshots and PDFs were floated in #10. That is a Storage
  bucket, bucket policies, a size and type gate, and a moderation surface — for
  evidence a human reads once. A URL does the same job with no new subsystem.
- **No host validation.** Do not constrain the URL to `skilljar.com`. Skilljar serves
  tenants on custom subdomains and CNAMEs, so the host belongs to Anthropic and can
  change on their schedule. Check it is a URL; let the human read it.
- **No parsed credential ID.** Its only real benefit is catching two people submitting
  the same certificate, which the human check already catches — they can see whose name
  is on it. Structure that duplicates a check already being performed is not worth a
  column.

### `certified` is derived, not stored

**Decided.** The profile has no `certified` column. It is "has a credential with
`source = 'Claude Certification'` and `earned_at` set", derived from rows the directory
card is already embedding in order to list them.

`AGENTS.md` defines `certified` as the practitioner's own claim to hold a Claude
Certification — and a credential row *is* that claim, since practitioners enter their
own credentials. Storing it as well means two representations of one fact that can
disagree, and the disagreement surfaces as a card claiming certification while listing
none, on the page whose entire job is credibility.

It also handles the case the director asked for without a third state: working towards
is a credential row with `earned_at` null, certified is one with `earned_at` set. The
boolean could never express that distinction.

`AGENTS.md` has been reworded accordingly — the invariant is that the two *ideas* stay
separate, one self-asserted and one attested by Bluehex. The second column was never
the invariant.

### No slugs, and no profile identity problem

**Decided by inspection.** `src/app/` has two routes, the home page and contact, and
nothing in `practitioner-directory.tsx` links a card anywhere. Profiles render inline on
the directory; there is no profile URL, so there is nothing for a slug to name and
nothing for a name change to break. #9's identity question has no subject.

**Gate:** the first per-profile route. A profile page needs a stable identifier that is
not the display name, and that decision should be made when the page is, not before.

## What the badge attests to, and why edits are not locked

**Decided.** `verified` attests to **evidence-backed claims only** — the credentials,
the education if a sister feature is ever built, and the `name` those are attached to.
It never attests to self-described expertise: `bio`, `headline`, `focus` and `location`
are outside it and always will be.

The principle is that Bluehex can only vouch for what a human can check. A certificate
can be opened and read; a degree can be checked against a registrar. "Good at RAG
pipelines" has no evidence to read, and a badge implying otherwise would assert
something Bluehex has no method for — which damages it more than a narrow badge does.

This retires the deferred question about a sister feature: **one badge covers every
evidence-backed table**, and each such table carries its own clearing trigger. Degrees
still live in their own table because the evidence and the check differ; the badge
covering both is a deliberate widening rather than the silent one that was objected to.

### The bug this fixes

#35's clearing rule watched `name` and `certified`. `certified` is now derived and the
credentials have moved to a child table, so **as written it watches nothing that can
carry a misrepresentation.** A practitioner verified on one Academy certificate could
rewrite `focus` to list five specialisms and keep the badge. The attested set above
replaces it.

### Edits are not locked

**Rejected: locking a profile after approval.** It would freeze every published profile
and make Bluehex the editor of record for other people's copy.

**Rejected: locking a profile after verification.** Defensible, and expensive in exactly
the way #35 escaped: a typo fix needs a human, verified practitioners cannot maintain
their own profiles, and the queue is permanent. It also does not resolve cleanly — an
unlock still has to decide what happens to the badge.

Instead:

- **Automatic clearing stays narrow.** The badge drops when the attested content
  changes, and only then. Everything else is freely editable and the profile stays up.
- **Drift is detectable for free.** `updated_at > verified_at` means "edited since we
  checked it" — no new column, and it gives Bluehex a review queue over every verified
  profile that has changed. An admin edit bumps `updated_at` too, so the queue has some
  false positives; at this volume that is cheaper than a column to suppress them.
- **Misrepresentation is an admin action, not a schema rule.** Status goes back to
  `pending` or `rejected`, which takes the profile down. Already decided in #35.

### The mitigation that is not in the schema

The badge belongs **next to the credentials on the card, not next to the person's
name**. A narrow badge placed where it reads as a whole-profile endorsement is
misleading no matter what the clearing rule does, and no schema rule can fix that
reading. This is a UI constraint that the directory work inherits.

Accepted consequence: `focus` drives the directory's filtering and is never vetted. That
is how every directory works, and the badge does not claim otherwise — but it is the
reason the badge's placement is load-bearing rather than cosmetic.

## Verification is per credential; the badge is a binary rollup

**Decided.** `verified`, `verified_at` and `verified_by` live on the **credential row**,
not the profile. The profile-level badge is **derived**, not stored — consistent with
`certified`.

The decisive argument is the incentive. Under a profile-level flag, adding a third
credential to a verified profile drops the whole badge until someone re-checks all
three — punishing practitioners for doing the thing the directory wants. Per credential,
the new row is unverified and the others are untouched. It also matches the workflow:
Bluehex checks certificates one at a time, and "three credentials, two checked" is a
real state a single boolean cannot hold.

`approved_at` / `approved_by` stay on the profile. That is `status`, a different axis.

**The rollup rule:** the badge shows when the profile has **at least one earned
credential and every earned credential is verified**. In-progress credentials
(`earned_at` null) sit outside the rollup entirely — they can never be verified, so
counting them would permanently deny the badge to anyone working towards a
certification, which is a group the directory exists to include.

**Rejected: a "partially verified" badge.** #10 is explicit that a lesser badge must be
unmistakably different from a verified one or it devalues the real ones by association —
and in a grid of cards, two pills with ticks are not unmistakably different. It is also
gameable in the wrong direction: if partial still shows a badge, the incentive is one
real credential plus padding. A binary badge makes padding cost the mark outright.

Instead the nuance is shown per credential, which is strictly more information than the
word "partial" and cannot be misread as a whole-profile endorsement. If a
profile-level summary is wanted it should read as a **fact, not a badge** — "2 of 3
credentials verified". Facts do not get confused with endorsements.

**The principle, which settles three questions at once:** *all nuance lives on the
credential row; the profile badge stays binary.* Partial verification, working-towards,
and mixed credential sources are all credential-level states. #10's "in progress"
requirement resolves here too — a credential with no `earned_at`, shown as such, never
touching the badge.

This is derived state, so partial-vs-binary is a presentation decision with **no schema
consequence**. It does not block the migration.

**Gate for materialising the rollup into a column:** when the directory stops fetching
every profile and needs to filter server-side. It is a client component filtering an
array today.

## Contact: held in its own table, never published

**Decided.** Nothing that reaches a practitioner directly appears on the profile — no
email, and no `website_url` / `github_url` / `linkedin_url`, which route around Bluehex
as effectively as an address does. Contact goes through the app: the existing `/contact`
page, reached from a card button that prefills which practitioner the enquiry is about.

**Contact details are stored, in `practitioner_contacts` — a table of their own, not
columns on `practitioners`.** The reason is structural rather than stylistic: a table
with no `anon` grants cannot be leaked by a future `grant select on practitioners to
anon`. The same reasoning as `public.admins` — the reliable protection is "not
reachable", not "we remembered not to name it in the grant list".

This is also load-bearing rather than tidy: **an unclaimed profile has no `user_id`, so
no `auth.users` row, so no address anywhere.** Without this table Bluehex cannot contact
a person it wrote up itself, and curated intake does not work at all.

**"The enquiry button goes somewhere" is a schema invariant**, and the mechanism is the direction of the foreign key rather than a constraint or a check. The contact row is written first and `practitioners.contact_id` is `not null unique`, so a profile without a contact cannot be represented — there is no state to validate, no RPC to route through, and no application code to remember. `contact_email` being `not null` on top of that rules out the address being empty.

An earlier draft had the foreign key the other way, which made a contact row optional in the schema and left the guarantee to a deferred constraint or an RPC. Reversing it deleted the problem instead of policing it.

**Creating a profile is two requests** — contact, then profile — because whichever table holds the pointer has to be written second. The failure mode is deliberately the harmless one: an abandoned signup leaves a contact row nobody references, not a published profile nobody can reach. See `practitioner_contacts` under Program design for what that costs.

Self-service defaults the address to the account email; curated intake uses whatever address the person replied from. The constraint lands on Bluehex's workflow — a curated profile cannot be created before they have an address — and that is the right place for it.

That address does **double duty while the profile is unclaimed**: it is also what a claim is checked against. Editing it then clears the badge, and once the profile is claimed it goes back to being ordinary contact information. See "The claim is checked against the contact email".

Kept separate from `auth.users.email` deliberately: one is a login identity, the other
is where work enquiries should go, and practitioners will reasonably want them to differ.
They can drift, and that is correct rather than a bug. Contact is not attested — editing
it never touches the badge.

**Where this sits against the brief.** scope.md's marketplace boundary excludes
"engagement or hire requests, and messaging between visitors and practitioners". An
enquiry form that emails *Bluehex* is not that — the exclusion is practitioner↔visitor
messaging: inboxes, threads, notifications, read state. It **becomes** the excluded
thing the moment practitioners read and answer enquiries in the app, and that needs
scope.md's boundary moved before the work rather than after.

**Accepted cost:** Bluehex is a bottleneck on every enquiry, permanently, with no
automation path. For a consulting arm that is arguably a feature — you learn who is
hiring first — but it is the first thing to strain if the directory succeeds.

**Deferred: portfolio links.** A GitHub or personal site is arguably evidence of work
rather than a contact route. Cut for now. **Gate:** practitioners asking for it — and it
should then be argued as a portfolio decision, not reopened as a contact one.

## Evidence visibility is the practitioner's call

**Decided.** `evidence_public boolean not null default false`, in the practitioner's
writable column set. Private by default; a practitioner who wants the credibility can
publish the certificate link.

The tension is real in both directions. Bluehex has no reputation to lend yet, so to an
employer who has never heard of it a clickable certificate is worth more than the word
"Verified" — early on, the evidence *is* the credibility. Against that, publishing a
Skilljar page exposes the practitioner's full legal name permanently. Letting them
choose resolves it without Bluehex making a privacy call on someone else's name.

**Flipping it must not clear verification.** It changes the claim's visibility, not the
claim, so it stays out of the attested set.

## Program design

Four tables, and the prerequisites they sit on. Those prerequisites are **repeated here
rather than referenced**, because the only other copy is in `docs/profile-lifecycle.md`,
which opens with "Do not implement from this file" and is scheduled for deletion once its
assertions land as tests. A binding spec cannot delegate its first statements to a
document that forbids implementing from it.

The decision behind this block — why a Postgres role rather than a flag or the service
role key — is `docs/adr/0001-admins-are-a-postgres-role.md`. It is unchanged; only the
DDL has moved.

**Statement order is load-bearing.** The role must exist before any `grant … to bluehex_admin` below it, and `custom_access_token_hook` must exist before `[auth.hook.custom_access_token]` is enabled anywhere — enabling the hook without the function takes down every sign-in and sign-up with `500 unexpected_failure`. The `config.toml` line and this migration are one commit.

**`practitioner_contacts` is created before `practitioners`**, because the profile holds the foreign key. The tables are documented below in the order a reader wants them — the profile first, since it is the thing everything else hangs off — which is *not* the order the migration writes them in. Create contacts, then practitioners, then credentials and review notes.

### Prerequisites: the role, the admin list, and the hook

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
create function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = ''
as $$
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
```

### `practitioners`

```sql
create type public.practitioner_status as enum
  ('pending', 'approved', 'rejected', 'withdrawn');

create table public.practitioners (
  id uuid primary key default gen_random_uuid(),
  -- nullable, and `set null` rather than `cascade`: deleting an account
  -- withdraws the profile (see Deletion), it does not destroy it
  user_id uuid unique references auth.users (id) on delete set null,

  -- the contact is written first and the profile points at it, so `not null`
  -- is the whole guarantee that an approved profile can be reached
  contact_id uuid not null unique references public.practitioner_contacts (id),

  name text not null,
  headline text,
  location text,                       -- free text; the practitioner picks granularity
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  bio text,
  focus text[] not null default '{}',

  status public.practitioner_status not null default 'pending',
  -- `review_note` is NOT here: it is admin feedback to one practitioner, and a
  -- column cannot be scoped to the owner. See `practitioner_review_notes`.
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  owner_assigned_at timestamptz,
  owner_assigned_by uuid references auth.users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`on delete set null` on `user_id`, paired with a trigger forcing `status = 'withdrawn'`.
Superseded `on delete cascade`, which was chosen before withdrawal and erasure were
separated: deleting a *login* should not be what erases a person's record. See Deletion.

`owner_assigned_at` / `owner_assigned_by` record the claim, per scope.md: transferring a
profile that may carry the badge is a privileged act worth attributing.

`location` stays free text. An enum or a place table would force a granularity decision
onto people who can express it perfectly well themselves. `country_code` is separate
because the card wants a flag and you cannot derive one from a string reliably.

### `practitioner_credentials`

```sql
create table public.practitioner_credentials (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null
    references public.practitioners (id) on delete cascade,

  source text not null
    check (source in ('Claude Certification', 'Anthropic Academy')),
  label text not null,
  earned_at date,                      -- null = working towards
  evidence_url text,
  evidence_public boolean not null default false,

  -- the attestation, per credential
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),

  -- what `anon` may read: the URL only when the practitioner has opted in
  evidence_url_public text
    generated always as (case when evidence_public then evidence_url end) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practitioner_credentials_practitioner_id_idx
  on public.practitioner_credentials (practitioner_id);
```

**The generated column is the mechanism that makes `evidence_public` enforceable.**
Column privileges are static; "readable only when another column is true" is not
sayable as a grant, and RLS filters rows rather than columns. Rather than reach for a
view — which drags in the `security_invoker` question and needs the underlying column
granted anyway — the masking is computed into a column of its own. `anon` is granted
`evidence_url_public` and never `evidence_url`, so opting out is enforced by the
privilege layer exactly like every other rule here.

`earned_at` is a `date`. A certificate is earned on a day, not at an instant, and a
timestamp would invite a timezone bug for no gain.

### `practitioner_contacts`

```sql
create table public.practitioner_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_email text not null,
  contact_phone text,
  contact_note text,
  -- who wrote the row, so it has an owner before any profile points at it
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**The contact is the parent, and the profile points at it.** `practitioners.contact_id` is `not null unique`, so a profile is structurally incapable of existing without a contact — no RPC, no deferred constraint, no application check. The `not null` is the entire enforcement.

That direction is what makes "contact first, then profile" possible, and it is the reason the order matters: whichever table holds the pointer has to be written second, because the pointer needs something to point at.

**Creating a profile is therefore two requests**, and the failure mode is deliberately the harmless one. If the second request fails, the result is a contact row nobody references — a stray email address — rather than a published profile with no way to reach the person. The profile is never in an invalid state, because the invalid state cannot be represented.

Three consequences, all accepted:

- **Orphaned contacts accumulate.** Someone fills in step one and abandons step two. They are cheap to sweep (`where not exists (select 1 from practitioners p where p.contact_id = id)`) and nothing depends on them being swept promptly. Worth doing before the table holds enough addresses to be worth stealing.
- **`created_by` exists so the row has an owner before a profile does.** Without it there is no way to express "you may read back the contact you just wrote", because the usual route — *the profile pointing at this row is yours* — has nothing to traverse yet.
- **Erasure is two deletes, not a cascade.** `on delete cascade` used to take the contact with the profile, which mattered because it is PII. Reversed, the profile goes first and the contact is deleted after it. See Deletion.

### `practitioner_review_notes`

```sql
create table public.practitioner_review_notes (
  practitioner_id uuid primary key
    references public.practitioners (id) on delete cascade,
  note text not null,
  written_at timestamptz not null default now(),
  written_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

A table rather than the `review_note` column #35 put on the profile. The reason is that the column could not be scoped to the person it is about: column privileges are per **role** and RLS is per **row**, so `grant select (review_note) … to authenticated` meant every signed-in practitioner could read Bluehex's feedback about every other one. `approve_practitioner()` clearing it on approval narrowed the window without closing it, since an admin setting `status` by `PATCH` leaves the note in place.

The same reasoning as `practitioner_contacts` and `public.admins`: the reliable protection is *not reachable*, not "we remembered not to name it in the grant list". A table has no `anon` grant by any route and an owner-only read policy, which a column cannot have.

One current note per profile rather than a history — `written_at` / `written_by` say who last wrote it. `reject_practitioner()` upserts; `approve_practitioner()` deletes the row, which is the same "approved rows carry no rejection feedback" rule #35 had, expressed as a delete rather than a null.

Nobody but `bluehex_admin` can write it. The owner reads it and cannot reply — feedback goes one way, and a practitioner responding to it is an edit to their profile, not a message.

### Grants

```sql
-- practitioners --------------------------------------------------------------
grant select (id, name, headline, location, country_code, bio, focus)
  on public.practitioners to anon;
grant select (id, name, headline, location, country_code, bio, focus,
              status, created_at, updated_at)
  on public.practitioners to authenticated;
grant insert (user_id, contact_id, name, headline, location, country_code, bio, focus)
  on public.practitioners to authenticated;
grant update (name, headline, location, country_code, bio, focus)
  on public.practitioners to authenticated;
-- deliberately no `delete`: leaving is `withdraw_profile()`, erasure is an admin
-- action on request. See Deletion.

grant select, delete on public.practitioners to bluehex_admin;
grant insert, update on public.practitioners to bluehex_admin;   -- incl. user_id

-- practitioner_credentials ---------------------------------------------------
grant select (id, practitioner_id, source, label, earned_at, verified,
              evidence_url_public)
  on public.practitioner_credentials to anon;
grant select (id, practitioner_id, source, label, earned_at, verified, verified_at,
              evidence_url, evidence_public, evidence_url_public,
              created_at, updated_at)
  on public.practitioner_credentials to authenticated;
grant insert (practitioner_id, source, label, earned_at, evidence_url, evidence_public)
  on public.practitioner_credentials to authenticated;
grant update (source, label, earned_at, evidence_url, evidence_public)
  on public.practitioner_credentials to authenticated;
grant delete on public.practitioner_credentials to authenticated;

grant select, insert, update, delete
  on public.practitioner_credentials to bluehex_admin;

-- practitioner_contacts ------------------------------------------------------
-- nothing to anon, ever
grant select (id, contact_email, contact_phone, contact_note, created_at, updated_at)
  on public.practitioner_contacts to authenticated;
grant insert (contact_email, contact_phone, contact_note)
  on public.practitioner_contacts to authenticated;
grant update (contact_email, contact_phone, contact_note)
  on public.practitioner_contacts to authenticated;
grant select, insert, update, delete on public.practitioner_contacts to bluehex_admin;

-- practitioner_review_notes --------------------------------------------------
-- nothing to anon, ever; the owner reads and never writes
grant select (practitioner_id, note, written_at)
  on public.practitioner_review_notes to authenticated;
grant select, insert, update, delete on public.practitioner_review_notes to bluehex_admin;
```

`created_by` is **not** in the `authenticated` insert list — it defaults to `auth.uid()` and a practitioner cannot name someone else as the author of a contact row. Nor is it readable: it is plumbing for the read policy, not information.

Note what `anon` never gets: `user_id`, `contact_id`, `status`, any provenance column, `evidence_url`, `evidence_public`, and every column of `practitioner_contacts` and `practitioner_review_notes`. `verified_by` is admin-only on credentials too — who performed a check is not public.

**`user_id` and `contact_id` are not readable by `authenticated` either**, which closes the gap review found on this grant. Column privileges are per *role* and RLS is per *row*, so a column readable "by the owner" is really readable by every signed-in caller on every row they can see — and both of these are handles to somebody else's account or PII. Nothing needs them: a practitioner knows their own `auth.uid()` without reading it back, `practitioners_read_own` filters on `user_id` without granting it, and the contact row is reached through its own table rather than through the pointer.

`status` stays, and is safe for a reason worth stating rather than assuming: another practitioner's row is only ever visible to you when it is `approved`, so `status` on a row that is not yours always reads the same value. It discloses nothing that visibility itself did not.

### Policies

`practitioners` keeps five of #35's six policies — `practitioners_read_approved`,
`practitioners_read_own`, `practitioners_admin_all`, `practitioners_insert_own` and
`practitioners_update_own`, all unchanged. **`practitioners_delete_own` is dropped**,
along with the `delete` grant to `authenticated`: it was the mechanism behind #35's
"self-removal is a `delete` on your own row", which this document supersedes with
`withdraw_profile()` and admin-performed erasure. Leaving it in would give a practitioner
two exits with very different consequences — the reversible one behind an RPC, the
irreversible one behind a plain HTTP verb — and no signposting between them.

`grant delete on public.practitioner_credentials to authenticated` **stays**, and the
asymmetry is deliberate: removing a credential you entered by mistake is ordinary
editing of your own claim, not erasure of a record Bluehex has attested to. The
`credentials_guard` clearing rule already covers the case where it is used to launder a
verified row — deleting and re-adding gets you an unverified credential, which is the
same outcome as editing one.

The two new tables follow the parent:

```sql
-- credentials: visible when the parent profile is, writable when the parent is yours
create policy credentials_read_public on public.practitioner_credentials
  for select to anon, authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.status = 'approved'));

create policy credentials_rw_own on public.practitioner_credentials
  for all to authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.practitioners p
                       where p.id = practitioner_id and p.user_id = (select auth.uid())));

create policy credentials_admin_all on public.practitioner_credentials
  for all to bluehex_admin using (true) with check (true);
```

Two things this leans on, both established in #35: a policy expression is **not** subject
to the caller's column privileges, so `p.status` and `p.user_id` are readable here even
though `anon` cannot select them; and `auth.uid() = user_id` is null rather than true for
an unclaimed profile, so unclaimed credentials are unreachable by every practitioner
without an extra clause. `practitioners` has no policy referencing credentials, so there
is no recursion.

**`practitioner_contacts` cannot follow that pattern**, because it is now the parent rather than the child. At insert time no profile points at the row, so "the profile that references me is yours" has nothing to traverse. It needs two routes in, and both are load-bearing:

```sql
-- no anon policy at all: there is no anon grant to go with one
create policy contacts_rw_own on public.practitioner_contacts
  for all to authenticated
  using (
    created_by = (select auth.uid())
    or exists (select 1 from public.practitioners p
                where p.contact_id = id and p.user_id = (select auth.uid()))
  )
  with check (created_by = (select auth.uid()));

create policy contacts_admin_all on public.practitioner_contacts
  for all to bluehex_admin using (true) with check (true);
```

The first clause covers the row you just wrote, including an orphan whose profile was never created. The second covers the row **Bluehex** wrote during curated intake, which a practitioner inherits the moment they claim the profile — `created_by` is the admin there, so without it a claimed practitioner could not read or edit their own contact details.

`with check` deliberately names only the first clause. You may write rows you own; you may not write a contact row into existence with somebody else's `created_by`, and you may not reassign an existing row to yourself. Reading through the profile is a right you inherit by claiming; writing is not.

```sql
-- review notes: the owner reads, only Bluehex writes
create policy review_notes_read_own on public.practitioner_review_notes
  for select to authenticated
  using (exists (select 1 from public.practitioners p
                  where p.id = practitioner_id and p.user_id = (select auth.uid())));

create policy review_notes_admin_all on public.practitioner_review_notes
  for all to bluehex_admin using (true) with check (true);
```

`for select` and nothing else for `authenticated` — there is no insert, update or delete grant on this table for anyone but `bluehex_admin`, so the feedback cannot be edited by its subject. That is the point of moving it off the profile row.

### Triggers

Two guards and one clearing rule, the last of which is shared by three triggers. `clear_profile_verification()` is the only privileged function among them; `withdraw_profile()` under Deletion is the other `security definer` in the design, which makes two overall.

Written out rather than described, because the three mistakes these are here to prevent are all invisible in prose: a `before insert or update` trigger that reads `OLD`, an `update of` clause read as though it fired on change, and an ownership rule read as a permission when it is a state machine.

1. **`practitioners_guard`** — `before update`. Pins `status`, the provenance columns and `user_id` to their old values for non-admin callers, and bumps `updated_at`. Its allow-list must include `supabase_auth_admin`, or the `set null` from an account deletion is pinned back and leaves a dangling reference — see Deletion.

   **It also enforces the ownership state machine**, which is the part that is not a permission question. `user_id` has three legal transitions and one illegal one, and the illegal one is the only place in this design that raises rather than pinning silently:

   ```sql
   -- ownership, for every caller including admins
   if new.user_id is distinct from old.user_id then
     if old.user_id is not null and new.user_id is not null then
       raise exception 'a profile cannot change owners'
         using errcode = '23514',
               hint = 'unassign the profile first, then claim it';
     end if;

     new.owner_assigned_at := now();
     new.owner_assigned_by := (select auth.uid());

     if new.user_id is null then
       new.status := 'withdrawn';
     end if;
   end if;
   ```

   | transition | meaning | verdict |
   | --- | --- | --- |
   | `null → A` | claiming an unclaimed profile | legal; stamps provenance and clears the badge |
   | `A → null` | the account was deleted, or an admin unassigns | legal; forces `withdrawn` |
   | `A → B` | nothing | **refused** |

   `A → B` is not a privilege to withhold, it is a state that should not exist: a profile is a record *about a person*, and there is no story where the record about one person legitimately becomes another person's. Refusing it here rather than in a grant means it holds for admins too, and a mis-assignment is still recoverable — unassign (`A → null`, which withdraws the profile while its ownership is in question), then claim it correctly.

   **Provenance is stamped by the trigger rather than by an RPC**, which is why `assign_profile_owner()` no longer exists. An RPC can be bypassed by an admin with an `update` grant; a trigger cannot. Claiming is now an ordinary `PATCH` setting `user_id`, and `owner_assigned_at/by` are written whether the caller remembered to or not.

   It raises here, against the silent-pinning convention #35 set, because the convention's justification does not apply: pinning is right when the column grant has already rejected the honest attempt with a clear `403`, and there is no grant that can express "this transition, not that one". Silently pinning `A → B` would tell the admin their write succeeded when it did nothing.

2. **`credentials_guard`** — `before insert or update`. **The two operations do different
   things and the trigger has to branch**: `OLD` is not assigned during a `before insert`,
   so the pin-to-`OLD` shape that `practitioners_guard` uses would raise
   `55000 record "old" is not assigned yet` on every credential a practitioner ever adds.
   On insert it forces the attestation columns to their unattested values; on update it
   pins them to `OLD` and applies the clearing rule.

   ```sql
   create function public.credentials_guard()
   returns trigger language plpgsql
   set search_path = ''
   as $$
   begin
     new.updated_at := now();

     if current_user in ('bluehex_admin', 'service_role', 'postgres', 'supabase_admin')
     then
       return new;
     end if;

     if tg_op = 'INSERT' then
       -- no OLD to pin to: a credential is born unverified
       new.verified    := false;
       new.verified_at := null;
       new.verified_by := null;
       return new;
     end if;

     new.verified    := old.verified;
     new.verified_at := old.verified_at;
     new.verified_by := old.verified_by;

     -- an edit to the claim invalidates the check of it; `evidence_public` is
     -- deliberately absent — it changes the claim's visibility, not the claim
     if new.source     is distinct from old.source
        or new.label      is distinct from old.label
        or new.earned_at  is distinct from old.earned_at
        or new.evidence_url is distinct from old.evidence_url then
       new.verified    := false;
       new.verified_at := null;
       new.verified_by := null;
     end if;

     return new;
   end;
   $$;

   create trigger credentials_guard
     before insert or update on public.practitioner_credentials
     for each row execute function public.credentials_guard();
   ```

3. **`clear_profile_verification()`** — one `security definer` function, called by **three** triggers. Each fires when something about *who this profile is* has changed, and none of them is a change to a credential:

   ```sql
   create function public.clear_profile_verification(profile_id uuid)
   returns void language plpgsql security definer
   set search_path = ''
   as $$
   begin
     update public.practitioner_credentials
        set verified = false, verified_at = null, verified_by = null
      where practitioner_id = profile_id
        and verified;
   end;
   $$;
   revoke execute on function public.clear_profile_verification(uuid)
     from public, anon, authenticated, bluehex_admin;
   ```

   It is privileged because a practitioner has no grant on `verified`, and the clear has to reach from the parent down to rows they cannot write. Narrow in the only way that matters: it sets the flag false and can do nothing else. Nobody may call it directly — it exists for the triggers.

   | trigger | fires on | why it is attested |
   | --- | --- | --- |
   | `practitioners_rename_clears_credentials` | `after update of name` on `practitioners`, `when (old.name is distinct from new.name)` | the badge asserts *this person* holds these |
   | `practitioners_claim_clears_credentials` | `after update of user_id` on `practitioners`, `when (old.user_id is null and new.user_id is not null)` | the claim changes which account the person is, which is a larger change than a rename |
   | `contacts_email_change_clears_credentials` | `after update of contact_email` on `practitioner_contacts`, when the referencing profile is still unclaimed | while unclaimed, that address is the credential a claim is checked against |

   **The `when` clause on the first is load-bearing, not decoration.** `update of name` fires when `name` appears in the statement's `SET` list, *whether or not the value changed* — and `supabase.from('practitioners').update(form)` round-trips the whole form object, so without the guard every bio edit would clear every badge on the profile. That is the failure this document's own incentive argument exists to avoid, arriving through the back door.

   **The third is the one that is easy to miss.** An unclaimed profile is claimed by matching the claimer's verified account email against `practitioner_contacts.contact_email` — so while `user_id is null`, that address is not a contact detail, it is the lock. Anyone who can change it can redirect the claim. Making the change clear the badge means a redirected claim inherits an unverified profile, and it costs the legitimate case one re-check on a profile nobody owns yet.

   Once the profile *is* claimed the rule stops applying, because the claim has already happened and the address is back to being ordinary contact information the owner edits freely:

   ```sql
   create function public.contacts_email_change_clears_credentials()
   returns trigger language plpgsql
   set search_path = ''
   as $$
   declare unclaimed_profile uuid;
   begin
     select p.id into unclaimed_profile
       from public.practitioners p
      where p.contact_id = new.id
        and p.user_id is null;

     if found then
       perform public.clear_profile_verification(unclaimed_profile);
     end if;
     return null;
   end;
   $$;

   create trigger contacts_email_change_clears_credentials
     after update of contact_email on public.practitioner_contacts
     for each row when (old.contact_email is distinct from new.contact_email)
     execute function public.contacts_email_change_clears_credentials();
   ```

**Every function here pins `search_path`**, and the `security definer` one qualifies every name inside it. A `security definer` function runs as its owner — `postgres`, since migrations run as `postgres` — and resolves unqualified names through whatever `search_path` is live at call time. PostgREST does not let a client set it per request, so this is hardening rather than a live hole, but Supabase's linter raises it as `function_search_path_mutable` and it costs one line.

**What the schema cannot reach.** None of this constrains a malicious *admin*, who can edit the contact email, claim the profile and re-verify it in three steps. Postgres has no answer to that and neither does any amount of policy. What the design buys is that each of those steps is attributed and the badge visibly drops in between, so the sequence leaves a trail rather than happening silently — proportionate when the admins are Bluehex itself and there are very few. It also bounds the damage from every *non*-admin path: the worst outcome of a claim that should not have happened is an **unverified** profile carrying somebody's name, which is vandalism an admin can undo, not a stolen credential.

### RPCs

`bluehex_admin` only, `security invoker`, no authorization logic inside — Postgres refuses the call to anyone else.

- `approve_practitioner(profile_id)` / `reject_practitioner(profile_id, note)` — as #35, except that both now touch `practitioner_review_notes` rather than a column: `reject` upserts the note, `approve` deletes it.
- `set_credential_verified(credential_id, value)` — replaces `set_practitioner_verified`. Verification is per credential now.

**`assign_profile_owner()` is gone.** Claiming is a plain `PATCH` setting `user_id`, and `practitioners_guard` stamps `owner_assigned_at/by` on the way through — which is strictly better than the RPC was, because an RPC can be bypassed by anyone holding the `update` grant and a trigger cannot. The three that remain earn their place: two write across tables atomically, and all three write provenance from `auth.uid()` rather than from whatever the caller passes.

### The rollup, in the client

The badge is derived where it is rendered:

```
badge = credentials.some(c => c.earned_at)          // at least one earned
     && credentials.filter(c => c.earned_at)        // and every earned one
                   .every(c => c.verified)          // is verified
```

The directory is a client component that fetches every profile and filters in the
browser, so this costs nothing today. Materialise it into a column when that stops being
true.

## Testing decisions

The #35 proof is 46 assertions against the local stack through PostgREST. It becomes a
committed test alongside the first migration rather than a shell script. What changes:

**Moves to the credentials table** — every assertion about writing `verified`. A
practitioner `PATCH`ing `{"verified": true}` on their own credential must be refused, and
must still be refused after the column grant is restored by hand. That backstop test is
the most valuable one in the suite and it transfers directly.

**New, and each one guards a rule that would fail silently:**

- Adding a credential to a verified profile leaves the existing credentials verified and
  the new one unverified — the incentive property the whole design turns on.
- Editing a credential's `label`, `source`, `earned_at` or `evidence_url` clears *that*
  credential's verification. Editing `evidence_public` does **not**.
- Renaming a profile clears verification on **every** credential. And the negative case,
  which is the one that actually bites: saving a profile whose `name` is **unchanged** —
  the whole form object round-tripped, `name` included — leaves every credential verified.
  `update of name` fires on targeting rather than on change, so this asserts the trigger's
  `when (old.name is distinct from new.name)` clause is present.
- Editing `bio`, `headline`, `focus` or `location` clears nothing, and leaves `status`
  untouched.
- `anon` selecting `evidence_url` is refused; selecting `evidence_url_public` returns
  null while `evidence_public` is false and the URL once it is true.
- `anon` has no access to `practitioner_contacts` by any route, including a filter.
- A practitioner cannot insert a credential against a profile that is not theirs, and
  cannot see credentials of an unclaimed profile.
- **A profile cannot be inserted without a `contact_id`.** The insert is refused by `not null` on the column, not by a trigger or a check — so this asserts the foreign key points the way the design needs it to. Two profiles cannot share a contact row either, which is the `unique`.
- A practitioner can read back a contact row they wrote before any profile pointed at it, and cannot read one written by somebody else.
- After claiming a curated profile, the new owner can read and edit the contact row **Bluehex** wrote — the second clause of `contacts_rw_own`, which is easy to omit and fails as "my own details are invisible to me".
- A practitioner cannot write a contact row with somebody else's `created_by`, and cannot reassign an existing one to themselves. `with check` names only the first clause of that policy for this reason.

**Ownership, where the rule is a state machine rather than a permission:**

- `null → A` claims the profile, stamps `owner_assigned_at/by` from `auth.uid()` **without the caller setting them**, and clears verification on every credential.
- `A → B` is **refused with an exception**, for `bluehex_admin` as much as anyone. This is the one place the design raises rather than pinning silently, so assert on the error rather than on the row being unchanged — a test that only checks the value would pass against a silent pin, which is the wrong behaviour.
- `A → null` is allowed and forces `withdrawn`.
- Unassign-then-reclaim gets a mis-assigned profile to the right account in two legal steps, with the badge cleared at the end of it.

**The claim credential:**

- Changing `contact_email` while the referencing profile is unclaimed clears verification on every credential of that profile.
- Changing it **after** the profile is claimed clears nothing — the address is ordinary contact information once ownership is settled, and a test that misses this direction would make every verified practitioner lose their badge for updating their own email.

**Review notes:**

- The owner reads their own note; another signed-in practitioner reading it is refused, including by filter. This is the assertion that would have caught `review_note` being a column.
- No practitioner can write, edit or delete a note on any profile, their own included.
- `approve_practitioner()` removes the note; `reject_practitioner()` writes one with `written_by` set from `auth.uid()`.

**Deletion, which has the subtlest failure mode in the design:**

- Deleting an `auth.users` row leaves the profile present, unowned and `withdrawn` —
  rather than erroring on a dangling reference, which is what happens if the guard
  trigger pins `user_id` back.
- A withdrawn profile is invisible to `anon` and to other practitioners, and still
  visible and editable to its owner.
- `withdraw_profile()` affects only the caller's own row, and a practitioner cannot use
  it to withdraw somebody else.
- Erasing a profile removes its credentials, its review note and its contact row. **The contact is a second statement, not a cascade** — the profile holds the foreign key now, so deleting the profile leaves the contact behind. A test that only asserts the profile is gone will pass while the PII stays.
- Orphaned contact rows — written, never referenced — are readable by the practitioner who wrote them and by nobody else, and the sweep removes only rows no profile points at.
- **A practitioner cannot erase their own profile.** `DELETE /practitioners?id=eq.<own>`
  is refused at the privilege layer — there is no `delete` grant to `authenticated` and no
  `practitioners_delete_own` policy. Leaving is `withdraw_profile()`; erasure is an admin
  action. This is the assertion that would have caught the grant being inherited from #35
  after the premise for it was removed.

**Reading the results.** PostgREST answers `401` for `anon` and `403` for a signed-in
caller on the same `permission denied`. The status code reports who asked, not what was
decided — asserting on it as though it were the authorization outcome will write a test
that passes for the wrong reason.

**Not tested, deliberately:** the rollup rule. It is client-side derivation over data the
tests already cover, and a test of it would assert a boolean expression against itself.

## Deletion: withdrawal, erasure, and the seam for downstream records

Three different things were being conflated under "delete", and separating them makes
each one easy.

### Withdrawal is a status

**Decided.** `withdrawn` joins the status enum. The profile stops being public
immediately, keeps its credentials and its verification history, and the practitioner can
come back without re-entering anything.

**No policy changes are needed to add it.** The public read policy is
`using (status = 'approved')` — an allow-list, so a new state is invisible the moment it
exists. The owner policy shows your own row in any state, so a withdrawn practitioner can
still see and edit their profile. Fail-closed, for free.

A practitioner cannot write `status`, by design, so withdrawal is `withdraw_profile()` —
a narrow `security definer` RPC granted to `authenticated` that affects only the caller's
own row. That is the second privileged function in the design, and like the first it only
ever reduces what is visible.

Coming back goes to `pending`, not straight to `approved`: content may have been edited
while withdrawn, so nothing returns to public view without a current admin decision.
Remembering the prior status to restore it is machinery that buys one admin click.

### Deleting an account withdraws the profile; it does not orphan it

**Decided.** `user_id` is `on delete set null`, with a trigger forcing
`status = 'withdrawn'` when it transitions to null. `on delete cascade` was the earlier
call and `set null` was rejected for leaving a published profile about someone who had
just withdrawn — that objection only held while status was untouched.

**A trap to prove rather than assume.** The FK's `set null` fires as an `update` on
`practitioners`, so the guard trigger sees it — and the guard pins `user_id` to its old
value for non-admin callers, which would undo the FK action and leave a dangling
reference. `supabase_auth_admin` must be in the guard's allow-list alongside
`bluehex_admin`, `service_role` and `postgres`. The assertion is: deleting an
`auth.users` row leaves the profile present, unowned and withdrawn, rather than erroring.

### Erasure is hard, and it is an admin action

**Decided.** A practitioner asking to be erased gets erased: profile, credentials, review note and contact row all deleted. It is a deliberate act on request rather than something that also fires when someone deletes a login they no longer use.

**Two statements, not one cascade.** Credentials and the review note are children of the profile and go with it; the contact row is its *parent* and does not. So erasure reads:

```sql
delete from public.practitioners where id = $1;      -- cascades credentials + note
delete from public.practitioner_contacts where id = $2;
```

That ordering is forced — the contact cannot go first while a profile still references it. It is the one place the flipped foreign key costs something rather than saving something, and the cost is a second statement in an admin-only path. Worth stating plainly because the failure is silent: erase a profile, forget the second delete, and the person's email address stays in the database after you have told them it is gone.

Hard delete is safe today because nothing downstream exists to break — see the seam
below, which is what keeps it safe later.

**Rejected: `deleted_at` soft delete.** It adds a fourth visibility axis on top of
`status`, `verified` and ownership, so every policy, grant and query must filter
`deleted_at is null` forever and missing one serves a deleted profile. It also retains
the personal data, so it costs a permanent tax and buys nothing on privacy. Worse, it
cannot satisfy both retention and erasure at once: it keeps a person's data alive to
serve records that should never have depended on it, leaving you unable to honour an
erasure request without breaking your own business records.

### The seam: downstream records own their own copy

**Not built. This is a boundary, recorded so the future work slots into it.**

Engagements, invoices, hire requests and anything else recording that a practitioner *did
something* are outside scope.md's marketplace boundary and are not being built. When they
are, the rule is:

> A downstream record **duplicates the identity it needs at the time of the event**, and
> holds an **optional** reference to the profile — `on delete set null`. It never depends
> on the profile row to render itself.

An invoice does not re-render the customer's current address; it captured it when it was
issued. The same applies here, and it is what lets erasure and retention coexist: the
person can be deleted, and the transaction record still stands on its own with whatever
legal retention it carries.

**Nothing is needed now to keep this option open.** The profile already has a stable UUID
that is never reused, which is the only thing a downstream record requires.

### Retention: two clocks, not one

**Personal data** on a withdrawn profile — kept until the practitioner asks for erasure,
stated in the privacy policy. A fixed retention window with automatic erasure is more
defensible and needs a scheduled job; not worth it at this volume, and revisit if the
directory grows.

**Transaction records**, when they exist, run on whatever the legal obligation is. Once
identity is captured at the time of the event they are not personal data in the same
sense, which is the entire point of the seam.
