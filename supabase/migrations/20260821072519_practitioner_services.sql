-- What a practitioner offers, as rows rather than an array column, capped at three.
--
-- Reproduces `docs/spec/profile-and-credentials.md` — the `practitioner_services`
-- DDL, its blocks under Grants and Policies, and `practitioner_services_cap` plus
-- `practitioner_services_set_updated_at` under Triggers. The spec is normative and its
-- SQL is written out deliberately; this file copies it rather than re-deriving it. One
-- place departs from it, marked **Departs from the spec** with the reason and carrying
-- a test that fails without it.
--
-- **No guard trigger, and that is the point rather than an omission.** This is the one
-- child table carrying no attested column — no `verified`, no provenance, nothing
-- Bluehex asserts — so there is no `OLD` to pin and no badge to clear. A practitioner
-- rewriting what they sell is ordinary editing, exactly like `bio`. For the same reason
-- no clearing rule fires on a service change: `clear_profile_verification()` gains no
-- fourth trigger here. Anything guard-shaped added to this file would be written from
-- the shape of the neighbouring tables rather than from the spec.

-- ---------------------------------------------------------------------------
-- practitioner_services
-- ---------------------------------------------------------------------------

create table public.practitioner_services (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null
    references public.practitioners (id) on delete cascade,

  -- exactly one of these. A catalogue row filters; a labelled row does not.
  --
  -- `restrict`, not `cascade`, and the opposite direction from `practitioner_id`
  -- above: a catalogue entry somebody offers is retired with `active = false`,
  -- never deleted out from under their profile. Without it an admin tidying the
  -- vocabulary silently removes services from profiles across the directory
  catalogue_id uuid references public.service_catalogue (id) on delete restrict,
  label text,

  created_at timestamptz not null default now(),
  -- maintained by `practitioner_services_set_updated_at` below rather than by the
  -- default, because it is in the `authenticated` select grant and is therefore a
  -- column the API serves. A timestamp that silently lies is worse than an absent
  -- one
  updated_at timestamptz not null default now(),

  -- the "or" is the table's whole shape, so it is a constraint rather than a
  -- convention: a row naming both would be filterable and free text at once, and
  -- a row naming neither renders as nothing. Neither state is reachable through
  -- the form, which is exactly why the constraint rather than the form says so
  constraint practitioner_services_one_kind
    check (num_nonnulls(catalogue_id, label) = 1),

  -- an empty or whitespace label is a row that renders as nothing. `[:space:]`
  -- rather than `btrim`, whose one-argument form strips spaces only and would
  -- accept a label of a single tab — a constraint that passes a spaces-only test
  -- and lets `E'\t'` through in production
  constraint practitioner_services_label_present
    check (label is null or label ~ '[^[:space:]]'),

  -- you cannot list the same catalogue service twice. Both columns, because one
  -- practitioner offering a service must not stop another offering it — that is
  -- the normal case. It permits any number of rows with `catalogue_id` null, the
  -- same property `practitioners.user_id` relies on for unclaimed profiles, so
  -- custom labels are deliberately *not* deduplicated: they are free text, they
  -- do not filter, and two near-identical ones are the practitioner's to notice
  -- rather than the schema's to refuse
  unique (practitioner_id, catalogue_id)
);

-- **Departs from the spec (1/1): the index is on `catalogue_id`, not on
-- `practitioner_id`.** The spec asks for `practitioner_id`, and the unique constraint
-- above already provides it: a btree on `(practitioner_id, catalogue_id)` serves
-- `where practitioner_id = $1` on its leading column, so a second index on that column
-- alone is write cost for no read. `catalogue_id` is the one that is genuinely
-- unindexed, and the `on delete restrict` check scans it on every attempt to delete a
-- catalogue entry — which is the sanctioned way an admin discovers a service is
-- offered, and a sequential scan of every profile's services without this.
--
-- The identical swap was made one migration earlier for the identical reason;
-- see `practitioner_credentials_catalogue_id_idx` in
-- `20260820222040_practitioner_credentials.sql`. Shipping the redundant index here
-- would be the same finding twice with opposite answers.
create index practitioner_services_catalogue_id_idx
  on public.practitioner_services (catalogue_id);

alter table public.practitioner_services enable row level security;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- A new table is invisible to the API until you `grant` on it, and the failure looks
-- like a broken policy: Postgres checks the privilege first and returns `42501
-- permission denied` without ever consulting the policy. Migrations run as `postgres`,
-- whose default privileges on `public` give `anon` and `authenticated` no read or
-- write, so nothing here is inherited from the earlier migrations.
--
-- Both kinds are public: a catalogue row drives the roster's chips and a custom label
-- renders on the profile, so `anon` reads both. What `anon` does not read is the
-- timestamps — reads are column-scoped as well as writes, which is what makes
-- `select *` refused and every query in the app name its columns.
--
-- `practitioner_id` is absent from the update grant on purpose. Moving a service from
-- one profile to another is not editing; it is the row changing whose it is, and the
-- `with check` on `services_rw_own` is not the place to discover that.

revoke all on public.practitioner_services from anon, authenticated;

grant select (id, practitioner_id, catalogue_id, label)
  on public.practitioner_services to anon;
grant select (id, practitioner_id, catalogue_id, label, created_at, updated_at)
  on public.practitioner_services to authenticated;
grant insert (practitioner_id, catalogue_id, label)
  on public.practitioner_services to authenticated;
grant update (catalogue_id, label) on public.practitioner_services to authenticated;

-- `delete` **stays**, as it does on `practitioner_credentials` and unlike on
-- `practitioners`: removing a service you no longer offer is ordinary editing of your
-- own profile, not erasure of a record Bluehex has attested to. Note that `delete`
-- cannot be column-scoped at all, so `services_rw_own` below is the only thing between
-- any signed-in account and every practitioner's services.
grant delete on public.practitioner_services to authenticated;

grant select, insert, update, delete on public.practitioner_services to bluehex_admin;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

-- The child follows its parent: visible when the profile is, writable when the profile
-- is yours. Both traversals go through the `security definer` helpers rather than
-- through an inline `exists (select 1 from public.practitioners p where …)` — a policy
-- escapes the caller's column privileges only for columns of **its own table**, while a
-- subquery against another one is an ordinary query and is privilege-checked like any
-- other. Inline, `services_rw_own` would be refused `42501 permission denied for table
-- practitioners` on `p.user_id` for the owner reading their own row, and
-- `services_read_public` would be refused on `p.status` for every anonymous request.
-- `owns_profile()` landed in `20260819194255_profile_core.sql` and
-- `profile_is_approved()` in `20260820222040_practitioner_credentials.sql`; both are
-- narrow in the only way that matters, returning a boolean about one profile and able
-- to disclose nothing else.
--
-- `owns_profile` is null rather than true for an unclaimed profile, so an unclaimed
-- profile's services are nobody's to write without an extra clause saying so. They stay
-- publicly readable, because curated intake is a published profile like any other.
-- `practitioners` has no policy referencing this table, so there is no recursion.

create policy services_read_public on public.practitioner_services
  for select to anon, authenticated
  using (public.profile_is_approved(practitioner_id));

create policy services_rw_own on public.practitioner_services
  for all to authenticated
  using (public.owns_profile(practitioner_id))
  with check (public.owns_profile(practitioner_id));

create policy services_admin_all on public.practitioner_services
  for all to bluehex_admin using (true) with check (true);

-- ---------------------------------------------------------------------------
-- practitioner_services_cap
-- ---------------------------------------------------------------------------

-- The cap of three is what argued for a child table over two array columns, so it is
-- the one mechanism here that cannot be left to the form: a rule the form enforces is
-- not enforced.
--
-- It is a trigger rather than a `check` because counting sibling rows needs a subquery,
-- which a check constraint may not contain. The array column got around that wall with
-- an `immutable` helper, and that escape hatch does not work twice — counting other
-- rows is by definition not immutable.
--
-- Left `security invoker`, unlike the trigger functions in
-- `20260820222040_practitioner_credentials.sql`: those were privileged because they
-- call a function the API roles hold no `execute` on, and because they read columns of
-- `practitioners` withheld from `authenticated`. This one reads only the table the
-- write is already against, and the count it needs is the count the caller can see —
-- `services_rw_own` shows an owner every row on their own profile and
-- `services_admin_all` shows an admin everything, and those are the only two callers a
-- write can arrive from.
create function public.practitioner_services_cap()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  held integer;
begin
  -- serialise writes for this profile. Without it two concurrent inserts each
  -- count two siblings and both commit a third. An advisory lock rather than
  -- `select … for update` on the parent, which would need an `update` privilege on
  -- `practitioners` this caller does not have and would additionally have to pass
  -- that table's own policies
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.practitioner_id::text, 0));

  select count(*) into held
    from public.practitioner_services
   where practitioner_id = new.practitioner_id
     and id is distinct from new.id;

  if held >= 3 then
    raise exception 'a practitioner may list at most three services'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- **`id is distinct from new.id` is what makes it correct on `update`.** Without it an
-- in-place edit of a legal third row counts that row itself and raises, so a profile
-- that has always been within the cap becomes uneditable the moment it reaches three —
-- a bug invisible until somebody meets the limit. It costs nothing on `insert`, where
-- the default has already filled `new.id` and no stored row matches it.
--
-- **It counts rows, not kinds**, which is the whole reason it is one trigger rather
-- than two. Three catalogue rows plus one custom row is four services, and a cap
-- enforced per kind is precisely the half-enforcement that ruled out two array columns.
--
-- It applies to `bluehex_admin` as well, with no allow-list: this is a rule about what
-- a profile may say rather than an authority over who may say it, which is the line
-- between this and every guard in the schema.
create trigger practitioner_services_cap
  before insert or update on public.practitioner_services
  for each row execute function public.practitioner_services_cap();

-- ---------------------------------------------------------------------------
-- practitioner_services_set_updated_at
-- ---------------------------------------------------------------------------

-- `set_updated_at()` is already there, created in `20260819194255_profile_core.sql`.
-- This table takes it because it has no guard of its own and never will, so without it
-- `updated_at` would hold its insert-time default forever on a column the API serves.
-- `practitioner_services_cap` does not do the job: it enforces a count and returns
-- `new` untouched.
create trigger practitioner_services_set_updated_at
  before update on public.practitioner_services
  for each row execute function public.set_updated_at();
