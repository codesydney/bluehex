-- Admin authority: the `bluehex_admin` role, the list of who holds it, and the
-- access token hook that stamps it into a signed-in user's JWT.
--
-- No product tables land here. This is the thing every later policy and grant
-- refers to. See `docs/adr/0001-admins-are-a-postgres-role.md` for why admin is a
-- Postgres role rather than a flag or the service role key, and
-- `docs/spec/profile-and-credentials.md` § "Prerequisites: the role, the admin
-- list, and the hook" for the DDL this reproduces.
--
-- Statement order is load-bearing twice over: the role must exist before anything
-- is granted to it, and `custom_access_token_hook` must exist before the hook is
-- enabled anywhere. Enabling the hook without the function takes every sign-in and
-- sign-up down with `500 unexpected_failure`, which is why the `config.toml`
-- change lands in the same commit as this file.

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
