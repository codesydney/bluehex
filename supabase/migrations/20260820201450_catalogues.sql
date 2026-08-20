-- The two catalogues: every Claude credential that exists, and the vocabulary the
-- directory filters on. Both are Bluehex-owned reference data rather than anybody's
-- record, which is why they are one migration rather than two — the same table
-- shape, the same grant asymmetry, the same pair of policies.
--
-- Reproduces `docs/spec/profile-and-credentials.md` — the `credential_catalogue`
-- and `service_catalogue` DDL, their blocks under Grants and under Policies, and
-- `service_catalogue_set_updated_at` under Triggers. The spec is normative and its
-- SQL is written out deliberately; this file copies it rather than re-deriving it.
--
-- What is not here, and must not be added ahead of the table it reads:
-- `catalogue_guard` and `correct_catalogue_entry()` land with #50, because the
-- guard's body queries `public.practitioner_credentials` and a plpgsql body
-- resolves its names at call time — shipping it now creates cleanly and then
-- raises `relation does not exist` on every update to `credential_catalogue`.
-- There is also nothing to guard: no claim can exist before that table does.
--
-- The consequence is accepted rather than papered over: **`credential_catalogue`
-- gets no `set_updated_at` trigger here**, because `catalogue_guard` is what bumps
-- that column and #50 would have to drop anything added in its place. A trigger
-- created in one merge and dropped in the next is exactly the throwaway
-- `AGENTS.md` forbids in a permanent history. Until #50, that column keeps its
-- insert-time default. `service_catalogue` has no such guard coming and takes
-- `set_updated_at` now, which is what the spec asks for.

-- ---------------------------------------------------------------------------
-- credential_catalogue
-- ---------------------------------------------------------------------------

-- every Claude credential that exists, one row each. Bluehex writes it; nobody
-- else can insert, and there is no free-text escape from it anywhere in the model.
--
-- It ships with no rows. The real list is Anthropic's and Bluehex's to state, and
-- a wrong label here is permanent, sits in migration history and is a wrong
-- credential name behind the Verified badge. An empty catalogue is fixed by an
-- `insert`, which is the sanctioned path for this table anyway. See #95.
create table public.credential_catalogue (
  id uuid primary key default gen_random_uuid(),
  source text not null
    check (source in ('Claude Certification', 'Anthropic Academy')),
  label text not null,
  -- retiring an entry hides it from the picker without invalidating the claims of
  -- people who earned it
  active boolean not null default true,
  -- what the picker sorts by; the Academy track has an order and alphabetical
  -- would scramble it
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- maintained by `catalogue_guard` from #50, not by the default: corrections to
  -- this table are admin `UPDATE`s rather than migrations, which is exactly the
  -- event this column exists to record. Until then it holds its insert-time value
  updated_at timestamptz not null default now(),

  -- no slug and no stable external key: the `id` is the reference, and this is
  -- what stops the same course being added twice by two admins
  unique (source, label)
);

alter table public.credential_catalogue enable row level security;

-- ---------------------------------------------------------------------------
-- service_catalogue
-- ---------------------------------------------------------------------------

-- the vocabulary the directory filters on. Bluehex writes it; it grows by
-- promoting custom services practitioners actually wrote, not by guessing
create table public.service_catalogue (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_catalogue enable row level security;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- A new table is invisible to the API until you `grant` on it, and the failure
-- looks like a broken policy: Postgres checks the privilege first and returns
-- `42501 permission denied` without ever consulting the policy. Migrations run as
-- `postgres`, whose default privileges on `public` give `anon` and `authenticated`
-- no read or write, so nothing here is inherited from the tables in
-- `20260819194255_profile_core.sql`.
--
-- The two omissions below are load-bearing and are the whole of two invariants.
-- No `insert`, `update` or `delete` to `authenticated` on `credential_catalogue`
-- is the entire enforcement of "a practitioner cannot invent a credential" — the
-- narrowness rests on `catalogue_id` being a foreign key and on nobody but
-- `bluehex_admin` holding `insert` on the table it points at. The same omission on
-- `service_catalogue` is the whole of "a custom service never becomes a filter
-- chip": a practitioner who could insert here would be widening the filter
-- vocabulary directly, and promotion is Bluehex's call rather than a queue.

revoke all on public.credential_catalogue from anon, authenticated;
revoke all on public.service_catalogue from anon, authenticated;

-- credential_catalogue -------------------------------------------------------
-- readable by everyone: the picker needs it, and so does the progress surface,
-- which is why `anon` gets it too — a public profile renders held credentials
-- against the whole set
grant select (id, source, label, active, sort_order)
  on public.credential_catalogue to anon, authenticated;
grant select, insert, update, delete on public.credential_catalogue to bluehex_admin;

-- service_catalogue ----------------------------------------------------------
-- readable by everyone: it is the roster's filter vocabulary, so `anon` needs it
-- to render the chips
grant select (id, label, active, sort_order)
  on public.service_catalogue to anon, authenticated;
grant select, insert, update, delete on public.service_catalogue to bluehex_admin;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

-- Public reference data rather than anybody's record, so these are dull — and
-- these are the tables on which forgetting `enable row level security` would cost
-- nothing, which is why the line sits at each `create table` above rather than
-- being written where it happens to matter.
--
-- `active` is deliberately not in the `using` clause. A profile holding a retired
-- credential still has to render its label, and hiding the row would make an
-- earned credential display as nothing at all. `active` filters the *picker*,
-- which is a query, not a policy.

create policy catalogue_read_all on public.credential_catalogue
  for select to anon, authenticated using (true);

create policy catalogue_admin_all on public.credential_catalogue
  for all to bluehex_admin using (true) with check (true);

create policy service_catalogue_read_all on public.service_catalogue
  for select to anon, authenticated using (true);

create policy service_catalogue_admin_all on public.service_catalogue
  for all to bluehex_admin using (true) with check (true);

-- ---------------------------------------------------------------------------
-- the service vocabulary's first rows
-- ---------------------------------------------------------------------------

-- Bluehex's own first guess at what the directory filters on, transcribed from
-- `services` in `src/lib/practitioners.ts` with its order kept as `sort_order` —
-- the chips the roster renders today and the rows behind them cannot start out
-- disagreeing. Expected to be wrong in the ordinary way; promotion is the
-- mechanism that corrects it, and it needs a list to start from.
--
-- Reference data rather than fixtures, which is what makes seeding it here the
-- right side of `AGENTS.md`'s rule about throwaway rows in migration history.
-- Corrections from here are admin `UPDATE`s, not a second migration.
--
-- `credential_catalogue` gets no equivalent block, and the asymmetry is decided
-- rather than an omission: those labels are Anthropic's and Bluehex's to state,
-- an empty catalogue is fixed by an `insert` whenever the real list appears, and
-- a *wrong* one is permanent and is a wrong credential name behind the Verified
-- badge. See #95, which owns the real list.
insert into public.service_catalogue (label, sort_order) values
  ('One-to-one tutoring', 0),
  ('Team training', 1),
  ('Code review', 2),
  ('Implementation', 3),
  ('Architecture and advisory', 4),
  ('Evaluation and testing', 5);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

-- `set_updated_at()` is already there, created in `20260819194255_profile_core.sql`
-- for `practitioner_contacts`. `service_catalogue` takes it because it has no
-- guard trigger of its own and never will: its correction path is an admin
-- `UPDATE`, so without this the column takes its default at insert and is never
-- written again. `credential_catalogue` gets no such trigger here — `catalogue_guard`
-- bumps that one, and it arrives with #50.
create trigger service_catalogue_set_updated_at
  before update on public.service_catalogue
  for each row execute function public.set_updated_at();
