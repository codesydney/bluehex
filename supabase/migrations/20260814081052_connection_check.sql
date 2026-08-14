-- The walking skeleton's one table. It exists so the app has something real to read:
-- a connection nobody has queried is not a connection, and a page that renders this
-- row has proven the whole path — migration, client, key, grant, policy, Server
-- Component.
--
-- It is plumbing, not domain. The practitioners table, its RLS policies and the
-- `verified` write protection are deliberately not here; see AGENTS.md, and issues
-- #9 and #14. Delete this table in the migration that adds the first real one.

create table public.connection_check (
  id smallint primary key generated always as identity,
  note text not null,
  checked_at timestamptz not null default now()
);

insert into public.connection_check (note)
values ('Supabase is answering.');

-- RLS on, always. A table in the `public` schema is reachable through PostgREST, so
-- for anything with a grant, "no policy yet" and "readable by the whole internet" are
-- the same state. Enabling RLS denies everything by default and makes the policy below
-- the only way in.
alter table public.connection_check enable row level security;

-- The grant is not optional, and leaving it out fails in a way that looks like a
-- broken policy. Two layers have to agree: Postgres checks the *privilege* first and
-- only then evaluates RLS, so a table with a perfect policy and no grant returns
-- `42501 permission denied` and never consults the policy at all.
--
-- It is easy to assume this is inherited, because in the schema there are two sets of
-- default privileges — `\ddp` in psql, or select from pg_default_acl:
--
--   owner supabase_admin  tables -> anon, authenticated get arwdDxtm  (everything)
--   owner postgres        tables -> anon, authenticated get Dxtm      (no r/w at all)
--
-- Migrations run as `postgres`, so every table a migration creates lands under the
-- second set and is unreadable until a grant says otherwise. Fails closed, which is
-- the right way round, and it is the same privilege layer AGENTS.md leans on to keep
-- `verified` out of a practitioner's reach. Grant deliberately and per column when the
-- column matters.
grant select on public.connection_check to anon, authenticated;

create policy "Connection check is readable by anyone"
  on public.connection_check
  for select
  to anon, authenticated
  using (true);

-- No insert, update or delete: no grant and no policy, so writes are refused at the
-- outer layer. That is the correct amount of power for a health check.
