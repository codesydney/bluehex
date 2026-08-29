-- An admin resolves an account id to an address (#123).
--
-- Two places on the review queue hold an account uuid and cannot say who it
-- belongs to. Assigning an owner asks the reviewer to check the claimer's
-- verified address against `practitioner_contacts.contact_email`, and gives them
-- a uuid to check it with. `practitioner_credentials.verified_by` records who
-- performed a check, and the queue can only render somebody else's as "another
-- Bluehex admin".
--
-- ## The grant is the control, because the predicate cannot be
--
-- `my_profile()` in `20260822050002_profile_own_reads.sql` is the idiom this
-- follows, and it is half a precedent: those functions take no argument, and
-- that file explains what the absence buys. This one has to take an argument,
-- because an admin is asking about somebody other than themselves.
--
-- So the predicate is not the control here and cannot be made into one. What
-- protects this is the execute grant, and it goes to `bluehex_admin` alone.
-- `authenticated` is one role holding every signed-in practitioner, so a grant
-- there would be a grant to all of them at once.
--
-- ## It does not narrow the population, and cannot
--
-- The obvious extra guard is to resolve only accounts that already hold a
-- profile. That would break the first caller precisely. A claimer is somebody
-- about to receive a profile Bluehex wrote during curated intake, so they hold
-- none yet, and that is the whole moment the lookup exists to serve. The second
-- caller is no better: an admin may hold a profile and is not required to. The
-- two populations together are "any account", so there is no subset to restrict
-- this to.
--
-- ## What it returns
--
-- The address and nothing else. `my_profile()` set the rule that a column
-- withheld on a table stays withheld through a function.
--
-- A table of `(id, email)` rather than a column of addresses, because rows go
-- missing and the result cannot be read by position. An id naming no account
-- returns nothing, an account with no address returns nothing, and the same id
-- passed twice returns one row. Callers read the answer by id.
--
-- `stable` so that a caller resolving the same ids twice in one statement is
-- planned as one lookup, and so that this can never be read as a function with
-- effects.

create function public.account_emails(ids uuid[])
returns table (id uuid, email text)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.email::text
    from auth.users u
   where u.id = any(ids)
     and u.email is not null;
$$;

-- `and u.email is not null` because the column is nullable. Magic link is the
-- only way in, so in practice every account has an address, but the type does
-- not say so and a caller should not have to hold a third case open on the
-- strength of that. Dropping the row folds "there is no answer" into the single
-- shape of a row that did not come back. The cost is that an admin cannot tell
-- an id that names nobody from an account with no address, which is a
-- distinction neither caller can act on: the comparison they are making cannot
-- proceed either way.
--
-- Note what this is not. It is not the population guard rejected above, which
-- would have decided *whose* address an admin may resolve. This drops rows that
-- carry no address to return.

revoke execute on function public.account_emails(uuid[]) from public, anon, authenticated;
grant execute on function public.account_emails(uuid[]) to bluehex_admin;

-- `execute` on a new function goes to `PUBLIC` by default, so the revoke is what
-- closes this rather than tidiness in front of the grant. Measured on the local
-- stack: created as `postgres` a function lands with `proacl` null and `anon`
-- calls it; after the revoke `proacl` reads `{postgres=X/postgres}` and `anon`
-- gets `permission denied for function`.
--
-- **`pg_default_acl` looks like it has already done that, and has not.** The row
-- for functions this role creates is `{postgres=X/postgres}`, which reads as a
-- restriction and is none: it grants to the owner, who holds execute anyway, so
-- the computed ACL matches the built-in default and stays null. The row beside
-- it for *tables* genuinely does withhold read and write from `anon`, which is
-- what makes this a trap — deleting the revoke on the strength of that row would
-- open this function to every caller, and there is nothing underneath it to
-- stop them.
--
-- `anon` and `authenticated` are named although `public` has already covered
-- them, matching `my_profile()`: who may call this should be readable here
-- rather than derived from a default.
--
-- `bluehex_admin` holds the grant on its own rather than through membership of
-- `authenticated`, which is the point. The revoke above strips what it would
-- otherwise inherit, so this line is the whole of who may call it.
