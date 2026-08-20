-- The first product tables: a practitioner's contact details, the published
-- profile that points at them, and Bluehex's review feedback about it.
--
-- Reproduces `docs/spec/profile-and-credentials.md` — the `practitioner_contacts`,
-- `practitioners` and `practitioner_review_notes` DDL, the Grants block, the
-- Policies section, `practitioners_guard` and `set_updated_at()` under Triggers,
-- and the two admin RPCs. The spec is normative and its SQL is written out
-- deliberately; this file copies it rather than re-deriving it.
--
-- Nothing credential-shaped lands here. `credential_catalogue`,
-- `practitioner_credentials`, `credentials_guard`, `catalogue_guard` and all three
-- `clear_profile_verification()` triggers — including the two that sit on
-- `practitioners` and the one on `practitioner_contacts` — arrive with #50, because
-- every one of them writes to a table that does not exist yet and a plpgsql body
-- resolves its names at call time.
--
-- Statement order is load-bearing: `practitioner_contacts` is the parent, so it is
-- created before the profile that carries the `not null` reference to it.

-- ---------------------------------------------------------------------------
-- the URL domain
-- ---------------------------------------------------------------------------

-- every published link is rendered as an `href` and is served to any API client
-- holding the publishable key, so the scheme is constrained here rather than
-- trusted in a render path: `javascript:` and `data:` never reach either.
-- Case-insensitive because RFC 3986 makes the scheme case-insensitive, and a
-- host with a dot in it because `https:///foo` otherwise passes. Deliberately
-- not a URL parser — it rejects the shapes that are dangerous or obviously
-- wrong and lets a human read the rest. Created once here and used again by
-- `practitioner_credentials.evidence_url` in #50.
create domain public.https_url as text
  check (value ~* '^https://[^[:space:]/]+\.[^[:space:]]+$' and length(value) <= 2048);

-- ---------------------------------------------------------------------------
-- practitioner_contacts — the parent, written before the profile points at it
-- ---------------------------------------------------------------------------

-- A table rather than columns on `practitioners`, and the reason is structural
-- rather than stylistic: a table with no `anon` grant cannot be leaked by a
-- future `grant select on practitioners to anon`. See
-- `docs/adr/0002-links-are-published-addresses-are-not.md` — a profile publishes
-- a route to a page, never a route to a person.
create table public.practitioner_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_email text not null,
  contact_phone text,
  contact_note text,
  -- who wrote the row, so it has an owner before any profile points at it.
  -- Nullable, and `set null`: `not null` here would make the account deletion
  -- fail rather than the profile withdraw, and `set null` is not available on a
  -- `not null` column. Losing it fails closed — `created_by = auth.uid()` is
  -- null rather than true for every caller, so the row is reachable only through
  -- the profile that points at it
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practitioner_contacts enable row level security;

-- ---------------------------------------------------------------------------
-- practitioners
-- ---------------------------------------------------------------------------

create type public.practitioner_status as enum
  ('pending', 'approved', 'rejected', 'withdrawn');

create table public.practitioners (
  id uuid primary key default gen_random_uuid(),
  -- nullable, and `set null` rather than `cascade`: deleting an account
  -- withdraws the profile, it does not destroy it. Nullable is also what makes
  -- curated intake possible, and it fails closed — `auth.uid() = user_id` is
  -- null rather than true on an unclaimed profile, so every owner policy
  -- excludes it without an extra clause
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

  -- `services` is NOT here: it moved to `practitioner_services` when
  -- practitioners were allowed to add their own, so that the cap could span
  -- catalogue and custom rows together. That table is #90.

  -- a sentence the practitioner asserts, never state the app maintains
  availability text,

  -- published links. A route to a page, not to a person. Public,
  -- practitioner-writable, and outside the attested set: editing one never
  -- clears the badge
  website_url public.https_url,
  github_url public.https_url,
  linkedin_url public.https_url,
  booking_url public.https_url,

  status public.practitioner_status not null default 'pending',
  -- `review_note` is NOT here: it is admin feedback to one practitioner, and a
  -- column cannot be scoped to the owner. See `practitioner_review_notes`.
  approved_at timestamptz,
  -- `set null` on every provenance reference to `auth.users`: the default is
  -- `NO ACTION`, which refuses the account deletion outright rather than doing
  -- anything to this row. The record that something was done outlives the
  -- account; who did it does not
  approved_by uuid references auth.users (id) on delete set null,
  owner_assigned_at timestamptz,
  owner_assigned_by uuid references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practitioners enable row level security;

-- ---------------------------------------------------------------------------
-- practitioner_review_notes
-- ---------------------------------------------------------------------------

-- A table rather than the `review_note` column the #35 spike put on the profile.
-- The column could not be scoped to the person it is about: column privileges are
-- per role and row level security is per row, so granting `select (review_note)`
-- to `authenticated` let every signed-in practitioner read Bluehex's feedback
-- about every other one.
create table public.practitioner_review_notes (
  practitioner_id uuid primary key
    references public.practitioners (id) on delete cascade,
  note text not null,
  written_at timestamptz not null default now(),
  written_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practitioner_review_notes enable row level security;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- A new table is invisible to the API until you `grant` on it, and the failure
-- looks like a broken policy: Postgres checks the privilege first and returns
-- `42501 permission denied` without ever consulting the policy. Migrations run as
-- `postgres`, whose default privileges on `public` give `anon` and `authenticated`
-- no read or write — the `revoke` below is therefore belt and braces rather than
-- load-bearing, and it is here because the other set of defaults (owner
-- `supabase_admin`, which is what a dashboard-created table gets) hands both roles
-- everything.
--
-- The grants are column-scoped in both directions, so `select *` is refused and
-- every query in this repo must name its columns. Note what `anon` never gets:
-- `user_id`, `contact_id`, `status` and every provenance column. `user_id` and
-- `contact_id` are not readable by `authenticated` either — column privileges are
-- per role while row level security is per row, so a column readable "by the
-- owner" is really readable by every signed-in caller on every row they can see,
-- and both are handles to somebody else's account or PII.
--
-- The `update` list is the load-bearing half of the `status` rule, and it is
-- maintained by hand: a column added later is not writable until it is named,
-- which fails closed. It is not sufficient alone — see `practitioners_guard`.

revoke all on public.practitioners from anon, authenticated;
revoke all on public.practitioner_contacts from anon, authenticated;
revoke all on public.practitioner_review_notes from anon, authenticated;

-- practitioners --------------------------------------------------------------
grant select (id, name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url)
  on public.practitioners to anon;
grant select (id, name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url,
              status, created_at, updated_at)
  on public.practitioners to authenticated;
grant insert (user_id, contact_id, name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url)
  on public.practitioners to authenticated;
grant update (name, headline, location, country_code, bio, focus,
              availability,
              website_url, github_url, linkedin_url, booking_url)
  on public.practitioners to authenticated;
-- deliberately no `delete`: leaving is `withdraw_profile()` (#52), erasure is an
-- admin action on request

grant select, delete on public.practitioners to bluehex_admin;
grant insert, update on public.practitioners to bluehex_admin;   -- incl. user_id

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

-- ---------------------------------------------------------------------------
-- asking whether a profile is yours, from another table's policy
-- ---------------------------------------------------------------------------

-- The spec writes the ownership traversal inline —
-- `exists (select 1 from public.practitioners p where … and p.user_id = auth.uid())`
-- — in the policies on `practitioner_contacts` and `practitioner_review_notes`,
-- on the basis that a policy expression is not subject to the caller's column
-- privileges. **That holds for a policy on its own table and not for a subquery
-- against another one**, which is an ordinary query and is privilege-checked like
-- any other. `user_id` and `contact_id` are deliberately withheld from
-- `authenticated`, so the inline form fails with
-- `42501 permission denied for table practitioners` — for the owner, reading
-- their own contact row. Proved against the local stack; see the tests.
--
-- So the question is asked through a `security definer` function instead, which
-- is what lets it be answered without the answer being readable. It is narrow in
-- the only way that matters: it returns a boolean about the caller and can
-- disclose nothing else. `auth.uid()` is read from the request's claims rather
-- than from the session user, so `security definer` does not change who is
-- asking, and a caller with no token gets `null = user_id`, which is false.
--
-- #50 and #90 need the same thing — `credentials_rw_own` and `services_rw_own`
-- both traverse `practitioners.user_id` — so this is the shared seam rather than
-- a one-off.

create function public.owns_profile(profile_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.practitioners p
     where p.id = profile_id
       and p.user_id = (select auth.uid())
  );
$$;

create function public.owns_profile_for_contact(contact uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.practitioners p
     where p.contact_id = contact
       and p.user_id = (select auth.uid())
  );
$$;

-- The same question asked of the contact row rather than the profile: did I write
-- this one, and is anything pointing at it yet. `practitioner_contacts.created_by`
-- is not granted to `authenticated`, and `practitioners.contact_id` is granted to
-- nobody but `bluehex_admin`, so neither is askable inline from a policy on the
-- other table.
--
-- Two functions rather than one because the two callers want different questions.
-- `practitioners_insert_own` wants authorship alone: at the moment a profile is
-- inserted its contact is unattached by definition, and a contact that already has
-- a profile is refused by `unique (contact_id)` — which is the mechanism that
-- should report it, rather than a policy shadowing the constraint with a 403.
create function public.owns_contact(contact uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.practitioner_contacts c
     where c.id = contact
       and c.created_by = (select auth.uid())
  );
$$;

-- `contacts_read_own` and `contacts_update_own` want the other half. Authorship is what carries a contact row
-- while nothing points at it; the moment a profile does, the profile is what says
-- who the row belongs to, and authorship stops meaning anything. Without this,
-- `created_by` is a grant that never expires — see the Policies section.
create function public.contact_is_unattached(contact uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.practitioners p where p.contact_id = contact
  );
$$;

-- Functions in `public` are executable by PUBLIC by default. `anon` never needs
-- any of these: it has no grant on the tables whose policies call them.
revoke execute on function public.owns_profile(uuid) from public, anon;
revoke execute on function public.owns_profile_for_contact(uuid) from public, anon;
revoke execute on function public.owns_contact(uuid) from public, anon;
revoke execute on function public.contact_is_unattached(uuid) from public, anon;
grant execute on function public.owns_profile(uuid) to authenticated;
grant execute on function public.owns_profile_for_contact(uuid) to authenticated;
grant execute on function public.owns_contact(uuid) to authenticated;
grant execute on function public.contact_is_unattached(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

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

-- `contact_id` is in the `authenticated` insert grant, so without the second
-- clause a profile insert is a read grant on somebody else's contact row: point
-- your own profile at a contact row you did not write and the profile clause of
-- `contacts_read_own` then answers true for you, which is the one route this table was
-- split out to close. `unique (contact_id)` is not that clause — it stops two
-- profiles sharing a row, not a stranger taking an unused one.
--
-- `contact_id is null` is let through here so that `not null` on the column is
-- what refuses a profile with no contact at all. Row level security is checked
-- before column constraints on insert, so without it the policy answers first and
-- reports `42501` for a row whose real problem is a missing `contact_id` — each
-- rule should fail with its own error, the same reason `unique (contact_id)` is
-- left to report the contact row that is already taken.
create policy practitioners_insert_own on public.practitioners
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (contact_id is null or public.owns_contact(contact_id))
  );

create policy practitioners_update_own on public.practitioners
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- `practitioners_delete_own` is deliberately absent, along with the `delete`
-- grant to `authenticated`. It was the mechanism behind the spike's
-- "self-removal is a `delete` on your own row", which the spec supersedes with
-- `withdraw_profile()` and admin-performed erasure. Leaving it would give a
-- practitioner two exits with very different consequences — the reversible one
-- behind an RPC, the irreversible one behind a plain HTTP verb — and no
-- signposting between them.

-- `practitioner_contacts` cannot follow the child-table pattern, because it is
-- the parent. At insert time no profile points at the row, so "the profile that
-- references me is yours" has nothing to traverse. It needs two routes in and
-- both are load-bearing: the first covers the row you just wrote, including an
-- orphan whose profile was never created, and the second covers the row Bluehex
-- wrote during curated intake, which a practitioner inherits the moment they
-- claim the profile.
--
-- **Authorship expires.** `created_by = auth.uid()` on its own is a grant nothing
-- ever takes away, and a profile can change hands: unassign it, assign it to
-- somebody else, and the row now holds the new owner's email and phone while the
-- original author still matches. That is the supported repair for a mis-assigned
-- profile, so it is reachable rather than theoretical, and it inverts the rule
-- below — the stranger who typed the row keeps write access while the person the
-- details are about does not. `contact_is_unattached` is what ends it: authorship
-- carries the row only while no profile points at it, and from then on the profile
-- is what says whose it is.
--
-- Three policies rather than one `for all`, because the clause has to differ by
-- verb. On `insert` the row is not in the table yet, so a helper that reads it
-- back returns false and would refuse every contact ever written; on `select` and
-- `update` the row is in hand and the full question can be asked.
--
-- `with check` still names authorship alone. You may not write a contact row into
-- existence with somebody else's `created_by`, you may not reassign an existing
-- one to yourself, and reading through the profile is a right you inherit by
-- claiming while writing is not — a claimer reads the row Bluehex wrote and cannot
-- edit it. If the product wants that, this is the line to change; see the spec.
--
-- No `delete` policy and no `delete` grant: a contact row outlives the profile
-- that pointed at it, and clearing it up is #52.
--
-- No `anon` policy at all: there is no `anon` grant to go with one.
create policy contacts_insert_own on public.practitioner_contacts
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy contacts_read_own on public.practitioner_contacts
  for select to authenticated
  using (
    public.owns_profile_for_contact(id)
    or (created_by = (select auth.uid()) and public.contact_is_unattached(id))
  );

create policy contacts_update_own on public.practitioner_contacts
  for update to authenticated
  using (
    public.owns_profile_for_contact(id)
    or (created_by = (select auth.uid()) and public.contact_is_unattached(id))
  )
  with check (created_by = (select auth.uid()));

create policy contacts_admin_all on public.practitioner_contacts
  for all to bluehex_admin using (true) with check (true);

-- review notes: the owner reads, only Bluehex writes. `for select` and nothing
-- else for `authenticated`, so the feedback cannot be edited by its subject.
create policy review_notes_read_own on public.practitioner_review_notes
  for select to authenticated
  using (public.owns_profile(practitioner_id));

create policy review_notes_admin_all on public.practitioner_review_notes
  for all to bluehex_admin using (true) with check (true);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

-- `practitioners_guard` — the other half of the column grants, and the half that
-- can still state the invariant when a later migration re-grants a column by
-- accident. Row level security cannot express "this row is yours to update, but
-- this column must not change": a policy has no `OLD`. A trigger does.
--
-- The allow-list must include `supabase_auth_admin`, or the `set null` an account
-- deletion performs on `user_id` is pinned back and leaves a dangling reference.
create function public.practitioners_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  -- `service_role` is deliberately absent. It holds no write privilege on this
  -- table, so listing it changed nothing today and pre-authorized a bypass for the
  -- day somebody grants it — of the one function that says who may move `status`
  -- and `user_id`. Admin authority is the `bluehex_admin` role and never the
  -- service key; see `docs/adr/0001-admins-are-a-postgres-role.md`.
  if current_user not in ('bluehex_admin', 'postgres',
                          'supabase_admin', 'supabase_auth_admin')
  then
    new.status            := old.status;
    new.approved_at       := old.approved_at;
    new.approved_by       := old.approved_by;
    new.owner_assigned_at := old.owner_assigned_at;
    new.owner_assigned_by := old.owner_assigned_by;
    new.user_id           := old.user_id;
  end if;

  -- ownership, for every caller including admins. This is the one place in the
  -- design that raises rather than pinning silently: pinning is right when the
  -- column grant has already rejected the honest attempt with a clear 403, and
  -- no grant can express "this transition, not that one". Silently pinning
  -- `A → B` would tell an admin their write succeeded when it did nothing.
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

  -- `approved_at` and `approved_by` mean "currently approved, by whom, when", and
  -- the trigger is what makes that true down every path rather than only through
  -- `approve_practitioner()`. An admin holds `update (status)` — that is what the
  -- ownership flow needs and the RPC cannot be made the only door — so a plain
  -- `PATCH {"status": "approved"}` publishes a profile, and without this it
  -- publishes one with no record of who published it. The `coalesce` leaves the
  -- RPC's own values alone.
  --
  -- Clearing on the way out is the same rule read backwards, and it is the half
  -- that was wrong before: a profile approved and later rejected kept the stamp
  -- and went on claiming it had been approved, which is exactly what a review
  -- queue sorts on. Last written wins, so `updated_at` is where "when did this
  -- last change" lives.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, (select auth.uid()));
  elsif new.status is distinct from 'approved' and old.status = 'approved' then
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

create trigger practitioners_guard
  before update on public.practitioners
  for each row execute function public.practitioners_guard();

-- `set_updated_at()` — for `practitioner_contacts`, the one table with no guard of
-- its own. Without it `updated_at` takes its default at insert and is never
-- written again, and there it is in the `authenticated` select grant: a column the
-- API serves and that would be wrong.
create function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
  before update on public.practitioner_contacts
  for each row execute function public.set_updated_at();

-- A note carries who last wrote it, not a history, so `written_at` and
-- `written_by` have to move whenever the text does. `reject_practitioner()` sets
-- both by hand and an admin holding `update` on the table can edit the note
-- without them, which leaves feedback attributed to the previous admin at the
-- previous date — and `written_at` is in the `authenticated` select grant, so that
-- is a wrong date shown to the practitioner the note is about. Stating it here
-- makes both write paths agree and turns the RPC's assignment into belt and
-- braces.
create function public.review_notes_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.note is distinct from old.note then
    new.written_at := now();
    new.written_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger review_notes_guard
  before update on public.practitioner_review_notes
  for each row execute function public.review_notes_guard();

-- ---------------------------------------------------------------------------
-- the admin write path
-- ---------------------------------------------------------------------------

-- `security invoker`, and no authorization logic inside: Postgres refuses the
-- call to anyone who is not `bluehex_admin`, and a hand-rolled check inside the
-- function would be a second authorization model that can disagree with the
-- first. Functions in `public` are executable by PUBLIC by default, so the
-- `revoke` is the mechanism and is not optional.

create function public.approve_practitioner(profile_id uuid)
returns public.practitioners language plpgsql
set search_path = ''
as $$
declare result public.practitioners;
begin
  update public.practitioners
     set status = 'approved',
         approved_at = now(),
         approved_by = (select auth.uid())
   where id = profile_id
   returning * into result;

  if not found then
    raise exception 'no such profile' using errcode = 'P0002';
  end if;

  -- approved rows carry no rejection feedback. A delete rather than a null,
  -- because the note is a row now
  delete from public.practitioner_review_notes where practitioner_id = profile_id;

  return result;
end;
$$;

revoke execute on function public.approve_practitioner(uuid)
  from public, anon, authenticated;
grant execute on function public.approve_practitioner(uuid) to bluehex_admin;

create function public.reject_practitioner(profile_id uuid, note text)
returns public.practitioners language plpgsql
set search_path = ''
as $$
declare result public.practitioners;
begin
  update public.practitioners
     set status = 'rejected'
   where id = profile_id
   returning * into result;

  if not found then
    raise exception 'no such profile' using errcode = 'P0002';
  end if;

  -- one current note per profile rather than a history: `written_at` and
  -- `written_by` say who last wrote it
  insert into public.practitioner_review_notes
              (practitioner_id, note, written_at, written_by)
       values (profile_id, note, now(), (select auth.uid()))
  on conflict (practitioner_id) do update
    set note       = excluded.note,
        written_at = excluded.written_at,
        written_by = excluded.written_by;

  return result;
end;
$$;

revoke execute on function public.reject_practitioner(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_practitioner(uuid, text) to bluehex_admin;
