-- A profile's public identifier becomes a column (#119).
--
-- It was `id.slice(0, 6)` — the first six characters of the row's uuid — computed in
-- TypeScript and enforced by nothing. `findByHandle` resolved with `.find()`, so a
-- collision did not error: it served the wrong practitioner's profile, with their
-- credentials and their badge on it. On the one product whose value is that the
-- badge means something, that is the worst available failure, because it fails open
-- and looks fine. Six hex characters is 24 bits, which is even odds at around 4,800
-- profiles and about 3% at a thousand; the eight rows in `supabase/seed.sql` collide
-- 100% of the time, because their literal uuids are all prefix.
--
-- So the uniqueness moves to where uniqueness is enforceable. `id` stays the uuid
-- foreign keys reference and `handle` becomes the public identifier; conflating the
-- two is what produced this.
--
-- **`not null unique` in one migration, with no backfill, because the hosted project
-- has zero practitioner rows.** A populated table would need the add-backfill-constrain
-- dance — add nullable, generate for every row, then constrain — and a future reader
-- finding the short version here should not conclude the dance is unnecessary in
-- general. It is unnecessary *here*, once, and this is the cheapest this decision will
-- ever be: the whole point of `/p/<handle>` is that it is a URL somebody pastes into a
-- job application, so changing the scheme after anyone has done that breaks links
-- people are relying on.
--
-- Three things this file does **not** do, each deliberately:
--
--   * No slug. `/p/<handle>` and nothing else. The handle is the key in either scheme,
--     so a readable prefix can be added later as pure decoration with every existing
--     link still resolving; removing slugs later would break every published URL.
--   * No practitioner-chosen handles. It is the nicest UX and the GitHub-shaped
--     answer, and it is user-controlled text on a product selling trust —
--     `/p/anthropic-official` is a real impersonation route. Bluehex owns the
--     namespace, the same shape as `credential_catalogue`. The check constraint below
--     is what holds that shut rather than a reserved-word list somebody maintains.
--   * No `handle` in any grant `authenticated` holds. A mutable handle breaks every
--     published link, so it is withheld exactly as `verified` is.

-- ---------------------------------------------------------------------------
-- the generator
-- ---------------------------------------------------------------------------

-- Eight characters of Crockford base32, lowercase: 40 bits, from an alphabet that
-- deliberately excludes `i`, `l`, `o` and `u` so a handle read aloud or copied off a
-- screen is unambiguous.
--
-- **`encode()` cannot do this.** Postgres supports `base64`, `hex` and `escape` only —
-- `encode('\x0102030405'::bytea, 'base32')` raises `unrecognized encoding: "base32"` —
-- so the bit packing is written out. Five bytes is exactly eight groups of five bits
-- with nothing left over, which is why five and not four or six: any other width needs
-- padding, and padding in an identifier is a character that carries no entropy.
--
-- The randomness comes from `gen_random_uuid()` rather than `gen_random_bytes()`. Both
-- are strong, and the difference is where they live: `gen_random_bytes` is pgcrypto,
-- which Supabase installs into the `extensions` schema, and this function runs with
-- `search_path = ''`, so it would have to name that schema and would then be pinned to
-- a layout the platform chose. `gen_random_uuid()` is core in Postgres 13 and later and
-- resolves out of `pg_catalog`, which is always searched. Bytes 0 through 4 of a v4
-- uuid are all random — the version nibble is in byte 6 and the variant bits are in
-- byte 8 — so taking the first five gives 40 unbiased bits rather than 40 bits with two
-- constants wired into them.
--
-- 40 bits is 1.1e12 values. By the birthday bound a collision is about one in a hundred
-- million at a thousand profiles and about one percent at 148,000. When it does happen
-- the `unique` constraint raises `23505` and the insert fails, which is the whole point:
-- the previous scheme's answer to a collision was to silently serve somebody else's
-- profile. There is no retry loop here, because a default expression is not the place
-- for one and a failed insert at those odds is a better trade than a loop nobody can
-- reason about.
--
-- `volatile`, which is also plpgsql's default, and stated rather than left implicit: it
-- is what stops the planner folding one call into a value shared by every row of a
-- multi-row insert. `security invoker`, likewise the default, and correct — the
-- function reads nothing and touches no table, so there is nothing for `definer` to
-- reach that the caller could not.
create function public.new_profile_handle()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- Crockford base32: the digits, then the letters with `i`, `l`, `o` and `u` removed.
  -- 32 symbols exactly; a 31- or 33-symbol string would silently bias or overflow the
  -- `& 31` below, so it is worth counting when this line is ever edited.
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  bytes bytea := decode(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 'hex');
  packed bigint;
  handle text := '';
  slot int;
begin
  -- the five bytes as one 40-bit integer, most significant byte first
  packed := (get_byte(bytes, 0)::bigint << 32)
          | (get_byte(bytes, 1)::bigint << 24)
          | (get_byte(bytes, 2)::bigint << 16)
          | (get_byte(bytes, 3)::bigint << 8)
          |  get_byte(bytes, 4)::bigint;

  -- eight five-bit groups, high bits first: slot 0 shifts 35 and slot 7 shifts 0, so
  -- every one of the 40 bits is consumed exactly once and none is consumed twice.
  -- `substr` is 1-based, hence the `+ 1`. An off-by-one anywhere on this line gives a
  -- short or biased handle, which looks fine until the collision rate is wrong —
  -- `tests/db/profile-handles.test.ts` samples the generator for exactly that.
  for slot in 0..7 loop
    handle := handle || substr(alphabet, ((packed >> (35 - 5 * slot)) & 31)::int + 1, 1);
  end loop;

  return handle;
end;
$$;

-- Functions in `public` are executable by PUBLIC by default, so the `revoke` is the
-- mechanism and is not optional. `authenticated` does need it, and the reason is easy
-- to miss: a column default is evaluated with the privileges of whoever performs the
-- insert, so without this grant the self-service profile insert (#14) fails with
-- `permission denied for function new_profile_handle` — an error that names a function
-- nobody in the application calls.
--
-- `anon` never inserts anything, so it never needs to evaluate the default.
revoke execute on function public.new_profile_handle() from public, anon;
grant execute on function public.new_profile_handle() to authenticated, bluehex_admin;

-- ---------------------------------------------------------------------------
-- the column
-- ---------------------------------------------------------------------------

-- `not null unique` with the default supplying every existing row. Zero rows on hosted,
-- and locally the seed replaces its eight with literals — see the note there.
--
-- The default is on the column rather than in application code so that every insert
-- gets a handle whatever wrote it: the app, a migration, `supabase/seed.sql`, or
-- somebody at a `psql` prompt. The database owns the handle exactly as it owns the
-- uniqueness, and there is no second generator to disagree with this one.
alter table public.practitioners
  add column handle text not null unique default public.new_profile_handle();

-- The format, stated as a constraint rather than trusted to the generator.
--
-- It is not belt and braces on `new_profile_handle()`, which cannot produce anything
-- else. It is what stops a *literal* — the seed's eight, an admin's `UPDATE`, a future
-- vanity handle — being something other than eight Crockford characters. That is the
-- impersonation route the ticket ruled out: `/p/anthropic-official` is refused here,
-- with no reserved-word list for anyone to maintain and get wrong.
--
-- Lowercase only, and the URL match is exact. Crockford's own specification folds case
-- and treats `i`/`l` as `1` and `o` as `0` on input; that is a decoding convenience for
-- a human retyping a code, and it would give one profile several URLs — which is the
-- thing #119 removed by deleting the slug. One handle, one URL.
alter table public.practitioners
  add constraint practitioners_handle_format
  check (handle ~ '^[0123456789abcdefghjkmnpqrstvwxyz]{8}$');

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- **`anon` must be able to read it or the directory cannot build a link**, and the
-- failure would read as a broken policy rather than a missing grant: Postgres checks
-- the privilege before it evaluates row level security, so the query returns
-- `42501 permission denied` without the policy ever running.
--
-- `authenticated` reads it too, so a signed-in practitioner can see their own URL.
--
-- Note what is absent, because absence is the whole rule here: `handle` is in neither
-- the `insert` nor the `update` grant `authenticated` holds. Column privileges are
-- checked at the privilege layer whatever the policies say, so a `PATCH` carrying
-- `{"handle": "..."}` is refused before any policy or trigger is consulted. Adding it
-- to either list would silently make every published link forgeable and rewritable —
-- exactly the shape of the `verified` rule, and it fails open rather than loudly.
--
-- `bluehex_admin` already holds table-wide `select`, `insert` and `update`, so it needs
-- nothing here and can correct a handle. That is deliberate and is the only write path
-- there is; `practitioners_guard` below is what makes it the only one.
grant select (handle) on public.practitioners to anon;
grant select (handle) on public.practitioners to authenticated;

-- ---------------------------------------------------------------------------
-- practitioners_guard — pinning the column the way `status` is pinned
-- ---------------------------------------------------------------------------

-- Replaced whole rather than patched, because a plpgsql body has no other shape. The
-- only change is `new.handle := old.handle` in the non-privileged branch; everything
-- else is `20260819194255_profile_core.sql`'s body unchanged, and it is repeated here
-- so the file that defines the function is the file you can read it in.
--
-- **Why a trigger as well as the grant.** The grant is what refuses the honest attempt,
-- with a clear 403 naming the privilege. The trigger is what still holds the day a
-- later migration re-grants `update (handle)` to `authenticated` by accident — which is
-- the failure mode AGENTS.md describes for `verified`, and it applies unchanged here:
-- a policy has no `OLD`, so "this row is yours to update, but this column must not
-- change" is not sayable in row level security and a trigger is the only place it can
-- be stated directly. `tests/db/profile-handles.test.ts` proves it by re-granting the
-- column by hand and asserting the write is still refused.
--
-- Pinned silently rather than raised, matching `status`: the grant has already rejected
-- the honest attempt with a clear error, and raising here would only change the message
-- on a path nobody can reach.
create or replace function public.practitioners_guard()
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
    -- #119. The public identifier is Bluehex's, not the practitioner's: it is what
    -- every published link resolves on, so a practitioner who could move it could
    -- break every reference to their own profile — and, with a handle somebody else
    -- had published, take over the URL a reader already trusts.
    new.handle            := old.handle;
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
