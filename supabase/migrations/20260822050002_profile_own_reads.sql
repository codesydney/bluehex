-- The owner's own reads.
--
-- Everything a practitioner needs to *write* their profile has been in place
-- since `20260819194255_profile_core.sql`. Reading it back is what was missing,
-- and #14 found it the hard way: the editor at `/profile` cannot render a form
-- over a row it is unable to fetch.
--
-- Two functions, both `security definer`, both returning only the caller's own
-- rows. Neither adds a column grant, because the arguments that withheld those
-- columns are right and are not being reopened — see the two blocks below.
--
-- ## Why `practitioners` needs this and the other tables do not
--
-- `docs/spec/profile-and-credentials.md` justifies withholding `user_id` from
-- `authenticated` by saying that "a practitioner knows their own `auth.uid()`
-- without reading it back, `practitioners_read_own` filters on `user_id`
-- without granting it". The second half of that sentence is true of
-- `practitioner_contacts` and `practitioner_review_notes`, where the owner
-- policy is the *only* policy `authenticated` holds: a bare unfiltered select
-- there returns exactly the caller's own rows, because RLS has already narrowed
-- it to them.
--
-- It is false of `practitioners`. `practitioners_read_own` sits in a
-- disjunction with `practitioners_read_approved`, and permissive policies OR,
-- so a bare select returns *every approved profile plus mine*. Narrowing that
-- to "mine" from the client would mean filtering on `user_id` — and Postgres
-- checks column privileges on columns referenced in `WHERE`, not merely on
-- those in the select list, so the filter is refused with `42501` before any
-- policy is consulted. No granted column separates the two sets either: once
-- Bluehex approves you, your own row is indistinguishable from everybody
-- else's among `id`, `handle`, `name`, `status` and the rest.
--
-- The near-miss worth naming, because it looks like it works: filtering
-- `status <> 'approved'` does return exactly your own row — right up until you
-- are approved, which is the case the editor most needs to get right.
--
-- The spec sentence is corrected in the same commit rather than left to
-- mislead the next reader the way it misled this one.
--
-- ## Why the raw `evidence_url` needs this
--
-- Not a gap — this one was always assigned here. `20260820222040_practitioner_
-- credentials.sql` withheld `evidence_url` and `evidence_public` from
-- `authenticated` because `credentials_read_public` shows every signed-in
-- caller every credential on every approved profile, so the raw column beside
-- the masked `evidence_url_public` let an account created a minute ago read
-- every practitioner's private certificate link — which is the full legal name
-- that `evidence_public` exists to let them withhold. That reasoning stands.
--
-- The cost it left unpaid is that the owner cannot read their own link back to
-- populate an edit form, and the spec says the route is "a per-row one — a
-- `security definer` read over the caller's own credentials … and it belongs
-- with the editor that needs it, in #14". This is that read. **Do not restore
-- the column grant to unblock a form**; that is the trade the credentials
-- migration refuses, and a grant is per role across every row it can see.
--
-- ## What makes these safe
--
-- `security definer` runs as the owner and therefore bypasses both the column
-- grants and RLS on the tables it touches. That is the entire point and it is
-- also the whole risk, so the predicate is the control: every row either
-- function can return is joined to `practitioners.user_id = (select auth.uid())`.
-- A caller holding no token gets `null = user_id`, which is `null` rather than
-- true, so an unclaimed profile — `user_id is null` by definition — is not
-- returned to an anonymous caller either. That is the same reasoning
-- `owns_profile()` relies on, stated again because the failure is silent.
--
-- `(select auth.uid())` rather than a bare call, so it is evaluated once
-- instead of per row. `set search_path = ''` so a caller cannot shadow a table
-- name; every reference below is schema-qualified because of it.
--
-- Neither function takes an argument. There is nothing to pass — the answer is
-- a function of who is asking — and an argument would be the obvious way to
-- turn either of these into a disclosure.

create function public.my_profile()
returns table (
  id uuid,
  handle text,
  contact_id uuid,
  name text,
  headline text,
  location text,
  country_code text,
  bio text,
  focus text[],
  availability text,
  website_url public.https_url,
  github_url public.https_url,
  linkedin_url public.https_url,
  booking_url public.https_url,
  status public.practitioner_status,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.handle, p.contact_id, p.name, p.headline, p.location,
         p.country_code, p.bio, p.focus, p.availability,
         p.website_url, p.github_url, p.linkedin_url, p.booking_url,
         p.status, p.created_at, p.updated_at
    from public.practitioners p
   where p.user_id = (select auth.uid());
$$;

-- `contact_id` is returned even though the contact row is reachable by a bare
-- select on `practitioner_contacts` — because an abandoned earlier submission
-- leaves a second contact row the same caller also created, and `contacts_read_own`
-- returns both. The pointer is the only thing that says which one is live.
--
-- `user_id` is not returned: the caller supplied it. Neither is any provenance
-- column — `approved_by`, `owner_assigned_by` and the timestamps beside them
-- are who at Bluehex did what, which is admin-only on the table and stays that
-- way here. `status` is returned because the editor has to say whether the
-- profile is pending, and `authenticated` may already read it anyway.

create function public.my_credentials()
returns table (
  id uuid,
  practitioner_id uuid,
  catalogue_id uuid,
  earned_at date,
  evidence_url public.https_url,
  evidence_public boolean,
  verified boolean,
  verified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.practitioner_id, c.catalogue_id, c.earned_at,
         c.evidence_url, c.evidence_public,
         c.verified, c.verified_at, c.created_at, c.updated_at
    from public.practitioner_credentials c
    join public.practitioners p on p.id = c.practitioner_id
   where p.user_id = (select auth.uid());
$$;

-- The join is to `practitioners` directly rather than through
-- `owns_profile(c.practitioner_id)`, which would be a function call per row for
-- an answer the join already has. `practitioners.user_id` is `unique`, so this
-- is one index lookup.
--
-- `verified` and `verified_at` are returned — the owner may already read both,
-- and a credential editor that could not show what Bluehex had checked would be
-- worse than useless. `verified_by` is not: who performed a check is admin-only
-- on the table and there is no reason for that to differ here.

revoke execute on function public.my_profile() from public, anon;
revoke execute on function public.my_credentials() from public, anon;
grant execute on function public.my_profile() to authenticated, bluehex_admin;
grant execute on function public.my_credentials() to authenticated, bluehex_admin;

-- `anon` is revoked explicitly as well as `public`, matching the four helpers
-- in the profile core: the predicate would already return nothing to a caller
-- with no token, and revoking anyway means a reader does not have to re-derive
-- that to know the answer.
--
-- `bluehex_admin` is named explicitly although it does not strictly need to be:
-- `grant authenticated to bluehex_admin` in the first migration makes an admin a
-- member of `authenticated`, and `execute` is inherited with the membership. It
-- is stated anyway, matching `new_profile_handle()`, because an admin is a
-- practitioner too and the grant should not quietly depend on a role membership
-- that exists for a different reason.
