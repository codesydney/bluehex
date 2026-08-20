-- The table the Verified badge actually attests to, and the machinery that keeps
-- the attestation honest. Verification lives **per credential**; the profile-level
-- badge is a rollup derived where it is rendered and is stored nowhere.
--
-- Reproduces `docs/spec/profile-and-credentials.md` — the `practitioner_credentials`
-- DDL, its blocks under Grants and Policies, `credentials_guard`, `catalogue_guard`,
-- `clear_profile_verification()` with all three of its triggers, and the
-- `set_credential_verified()` and `correct_catalogue_entry()` RPCs. The spec is
-- normative and its SQL is written out deliberately; this file copies it rather than
-- re-deriving it. Seven places depart from it, each marked **Departs from the spec**
-- with the reason, and each carrying a test that fails without it.
--
-- It also completes two things earlier migrations deliberately left undone:
-- `credential_catalogue.updated_at` is maintained from here, because `catalogue_guard`
-- is what bumps it and its body reads the table created below; and the repointing of a
-- claimed catalogue entry becomes refusable, because until now there was no claim to
-- refuse it on behalf of.

-- ---------------------------------------------------------------------------
-- practitioner_credentials
-- ---------------------------------------------------------------------------

create table public.practitioner_credentials (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null
    references public.practitioners (id) on delete cascade,

  -- `restrict`, not `cascade`: a catalogue entry with claims against it must be
  -- retired via `active`, never deleted out from under somebody's profile. Without
  -- it an admin tidying the catalogue silently destroys every claim to a course,
  -- verified ones included, which is the badge coming apart in a way nothing else
  -- in this design permits
  catalogue_id uuid not null
    references public.credential_catalogue (id) on delete restrict,

  -- `not null`: there is no in-progress credential. Every row here is earned, and
  -- progress is derived by comparing what is held against the catalogue. A test
  -- asserts the `not null` directly, so the concept cannot return as data after the
  -- prose that removed it has been forgotten
  earned_at date not null,

  -- `https_url` rather than `text`, the domain created in
  -- `20260819194255_profile_core.sql`: `evidence_url_public` below is granted to
  -- `anon` and rendered as an `href`, so this is a published link on the same terms
  -- as the profile's. Still nullable — an earned credential awaiting proof is
  -- approvable and unbadgeable, which is a real state
  evidence_url public.https_url,
  evidence_public boolean not null default false,

  -- the attestation, per credential
  verified boolean not null default false,
  verified_at timestamptz,
  -- `set null`: the default is `NO ACTION`, which would make an admin who leaves
  -- and has their account deleted block that delete against every credential they
  -- ever checked
  verified_by uuid references auth.users (id) on delete set null,

  -- What `anon` may read: the URL, and only when the practitioner has opted in.
  -- **This is the mechanism that makes `evidence_public` enforceable rather than
  -- advisory.** Column privileges are static, so "readable only when another column
  -- is true" is not sayable as a grant, and row level security filters rows rather
  -- than columns. Rather than a view — which drags in the `security_invoker`
  -- question and needs the underlying column granted anyway — the masking is
  -- computed into a column of its own: `anon` is granted this one and never
  -- `evidence_url`, so opting out is enforced by the privilege layer exactly like
  -- every other rule here.
  --
  -- `text` rather than `https_url`, because a generated column inherits the
  -- constraint's effect through `evidence_url` and does not need to re-declare it
  evidence_url_public text
    generated always as (case when evidence_public then evidence_url end) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- you cannot claim the same credential twice. Not expressible while the label was
  -- free text, because `Prompt engineering` and `Prompt Engineering` are two strings.
  -- Both columns, because one practitioner claiming an entry must not stop another
  -- from claiming it — that is the normal case
  constraint practitioner_credentials_one_claim_each
    unique (practitioner_id, catalogue_id)
);

-- **Departs from the spec (1/7): the index is on `catalogue_id`, not on
-- `practitioner_id`.** The spec asks for `practitioner_id`, and the unique constraint
-- above already provides it: a btree on `(practitioner_id, catalogue_id)` serves
-- `where practitioner_id = $1` on its leading column, so a second index on that
-- column alone is write cost for no read. `catalogue_id` is the one that is genuinely
-- unindexed, and two things scan it — the `on delete restrict` check, and
-- `catalogue_guard` below, which asks "does this entry have claims against it" on
-- every update to `credential_catalogue`.
create index practitioner_credentials_catalogue_id_idx
  on public.practitioner_credentials (catalogue_id);

alter table public.practitioner_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------

-- A new table is invisible to the API until you `grant` on it, and the failure looks
-- like a broken policy: Postgres checks the privilege first and returns `42501
-- permission denied` without ever consulting the policy. Nothing here is inherited
-- from the tables in the earlier migrations.
--
-- **`verified`, `verified_at` and `verified_by` are absent from every list granted to
-- `authenticated`**, which is the load-bearing omission in this file — self-service
-- puts an untrusted writer next to Bluehex's own attestation for the first time. It is
-- not sufficient alone: row level security cannot express "this row is yours to update,
-- but this column must not change", so `credentials_guard` states the same rule where
-- it can still be stated after a later migration re-grants the column by accident. The
-- test that restores the grant by hand and confirms the write is still refused is the
-- one that catches that day.
--
-- `verified_by` is admin-only in every direction: who performed a check is not public,
-- and is not another practitioner's business either.
--
-- **Departs from the spec (2/7): `evidence_url` and `evidence_public` are readable by
-- nobody but `bluehex_admin`**, and the spec's list is amended to match. It grants both to
-- `authenticated`, which reads as "the owner can see their own" and is not what a column
-- grant says: privileges are per *role* and row level security is per *row*, so a column
-- granted to `authenticated` is readable by every signed-in caller on every row they can
-- see — and `credentials_read_public` below shows them every credential on every approved
-- profile. The raw column beside the masked one is the masked one doing nothing: any
-- account, thirty seconds old, could read every practitioner's private certificate link,
-- which is the full legal name that `evidence_public` exists to let them withhold. It is
-- the same argument the spec makes two paragraphs later for keeping `user_id` and
-- `contact_id` off this role, and `evidence_url` is the third column with that shape.
--
-- The cost is real and is deliberately not paid here: the owner cannot read their own
-- `evidence_url` back to populate an edit form. No application code exists to want it
-- yet, a column grant cannot say "the owner only", and a generated column cannot mask on
-- `auth.uid()`, so the route is a per-row one — a `security definer` read over the
-- caller's own credentials, alongside `profile_is_approved()` — and it belongs with the
-- editor that needs it in #14. Until then this fails closed, which is the right way
-- round.

revoke all on public.practitioner_credentials from anon, authenticated;

grant select (id, practitioner_id, catalogue_id, earned_at, verified,
              evidence_url_public)
  on public.practitioner_credentials to anon;
grant select (id, practitioner_id, catalogue_id, earned_at, verified, verified_at,
              evidence_url_public,
              created_at, updated_at)
  on public.practitioner_credentials to authenticated;
grant insert (practitioner_id, catalogue_id, earned_at, evidence_url, evidence_public)
  on public.practitioner_credentials to authenticated;
grant update (catalogue_id, earned_at, evidence_url, evidence_public)
  on public.practitioner_credentials to authenticated;

-- `delete` **stays**, unlike on `practitioners`, and the asymmetry is deliberate:
-- removing a credential you entered by mistake is ordinary editing of your own claim,
-- not erasure of a record Bluehex has attested to. It cannot be used to launder a
-- verified row either — delete and re-add yields an unverified credential, which is
-- the same outcome as editing one. Note that `delete` cannot be column-scoped at all,
-- so `credentials_rw_own` is the only thing between any signed-in account and every
-- practitioner's credentials.
grant delete on public.practitioner_credentials to authenticated;

grant select, insert, update, delete
  on public.practitioner_credentials to bluehex_admin;

-- ---------------------------------------------------------------------------
-- asking whether a profile is published, from another table's policy
-- ---------------------------------------------------------------------------

-- **Departs from the spec (3/7), where the spec asks it to be settled here.** The
-- spec writes `credentials_read_public` as an inline
-- `exists (select 1 from public.practitioners p where … and p.status = 'approved')`
-- and then notes that `anon` has no `select` on `p.status`, leaving the fix to this
-- ticket. It is the same trap #49 found on the ownership traversal: a policy escapes
-- the caller's column privileges only for columns of **its own table**, while a
-- subquery against another one is an ordinary query and is privilege-checked like any
-- other. Inline, every anonymous read of a credential would be refused
-- `42501 permission denied for table practitioners` — on the public directory's
-- primary read path.
--
-- So the third helper, alongside `owns_profile` and friends. It is narrow in the only
-- way that matters: it returns a boolean about one profile and can disclose nothing
-- else, and `status` is the column the spec already calls safe to expose, since a row
-- another caller can see at all is always `approved`.
--
-- `anon` gets `execute` here, unlike on the ownership helpers — it is the caller the
-- function exists for.
create function public.profile_is_approved(profile_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.practitioners p
     where p.id = profile_id
       and p.status = 'approved'
  );
$$;

revoke execute on function public.profile_is_approved(uuid) from public;
grant execute on function public.profile_is_approved(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

-- The child follows its parent: visible when the profile is, writable when the
-- profile is yours. `owns_profile` is null rather than true for an unclaimed profile,
-- so unclaimed credentials are unreachable by every practitioner without an extra
-- clause, and `practitioners` has no policy referencing this table, so there is no
-- recursion.
create policy credentials_read_public on public.practitioner_credentials
  for select to anon, authenticated
  using (public.profile_is_approved(practitioner_id));

create policy credentials_rw_own on public.practitioner_credentials
  for all to authenticated
  using (public.owns_profile(practitioner_id))
  with check (public.owns_profile(practitioner_id));

create policy credentials_admin_all on public.practitioner_credentials
  for all to bluehex_admin using (true) with check (true);

-- ---------------------------------------------------------------------------
-- credentials_guard
-- ---------------------------------------------------------------------------

-- The other half of the column grants, and the half that can still state the
-- invariant when a later migration re-grants a column by accident.
--
-- **`before insert or update`, and the two operations do different things**, which is
-- the one shape in this file that cannot be simplified: `OLD` is not assigned during a
-- `before insert`, so the pin-to-`OLD` form `practitioners_guard` uses would raise
-- `55000 record "old" is not assigned yet` on every credential a practitioner ever
-- adds. On insert the attestation columns are forced to their unattested values; on
-- update they are pinned to `OLD` and the clearing rule applies.
--
-- **Departs from the spec (4/7): the allow-list gates the pin and nothing else.** The
-- spec returns early for a privileged caller, which skips the clearing rule and the
-- provenance stamp along with the pin — and `bluehex_admin` holds unrestricted `update`
-- on this table, so both were reachable with a plain `PATCH`. It let an admin publish a
-- badge with `verified_at` and `verified_by` still null, making `set_credential_verified()`
-- one write path among several rather than the canonical one; and it let an admin repoint
-- a *verified* credential at another catalogue entry with the attestation left standing,
-- so the badge asserted a check of a claim nobody made — which is exactly what
-- `catalogue_guard` is added below to refuse one table over.
--
-- `practitioners_guard` does not have that shape and this now matches it: there the
-- allow-list gates only the pin block, while the ownership state machine and the
-- `approved_at`/`approved_by` maintenance run for every caller including admins, on the
-- stated grounds that a plain `PATCH {"status": "approved"}` must not publish a profile
-- with no record of who published it. The same sentence, one table along.
create function public.credentials_guard()
returns trigger language plpgsql
set search_path = ''
as $$
declare privileged boolean;
begin
  new.updated_at := now();

  -- **Departs from the spec (5/7): `service_role` is not on this list.** The spec
  -- names it; `practitioners_guard` already does not, for a reason that applies
  -- identically here — it holds no write privilege on this table, so listing it
  -- changes nothing today and pre-authorizes a bypass of the one function that says
  -- who may move `verified`, for the day somebody grants it. Admin authority is the
  -- `bluehex_admin` role and never the service key; see
  -- `docs/adr/0001-admins-are-a-postgres-role.md`.
  --
  -- **`supabase_auth_admin` is not on it either, and that is a decision rather than an
  -- omission.** `practitioners_guard` lists it, on the grounds that deleting an
  -- `auth.users` row is GoTrue's write and the `on delete set null` it triggers would
  -- otherwise be pinned back. `verified_by` here has exactly the same shape, so the
  -- question is live — and the premise is wrong for both. A referential action runs as
  -- the owner of the table it modifies, not as the role that issued the delete: probed
  -- against the local stack, `delete from auth.users` issued with
  -- `set role supabase_auth_admin` reaches this trigger with `current_user = postgres`,
  -- which the list already covers. Listing a role that never arrives is the same
  -- pre-authorization `service_role` is excluded for, so it is left out and the
  -- account-deletion assertion is what says the cascade still works.
  privileged := current_user in ('bluehex_admin', 'postgres', 'supabase_admin');

  if tg_op = 'INSERT' then
    -- no OLD to pin to: a credential is born unverified. Forced rather than refused,
    -- so a client that round-trips the whole row gets a saved credential rather than
    -- an error it cannot act on
    if not privileged then
      new.verified    := false;
      new.verified_at := null;
      new.verified_by := null;
    end if;

    -- and the stamp holds on the way in too, so a row born verified names who said so
    if new.verified then
      new.verified_at := coalesce(new.verified_at, now());
      new.verified_by := coalesce(new.verified_by, (select auth.uid()));
    else
      new.verified_at := null;
      new.verified_by := null;
    end if;

    return new;
  end if;

  if not privileged then
    new.verified    := old.verified;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
  end if;

  -- An edit to the claim invalidates the check of it, **whoever is editing**. An admin
  -- correcting an `earned_at` is correcting the thing that was checked, and the badge
  -- has to stop asserting the old check exactly as it does for the practitioner.
  -- `evidence_public` is deliberately absent — it changes the claim's *visibility*, not
  -- the claim — and `catalogue_id` replaces the old `kind`/`label` pair, so changing
  -- which credential you claim is now one column and is still the largest edit there is.
  if new.catalogue_id  is distinct from old.catalogue_id
     or new.earned_at    is distinct from old.earned_at
     or new.evidence_url is distinct from old.evidence_url then
    new.verified    := false;
    new.verified_at := null;
    new.verified_by := null;
  end if;

  -- Provenance follows the flag down every path rather than only through
  -- `set_credential_verified()`, which is the same rule `practitioners_guard` states for
  -- `approved_at` and `approved_by`: the RPC cannot be made the only door while
  -- `bluehex_admin` holds `update`, so a direct write must carry the stamp too. The
  -- `coalesce` leaves the RPC's own values alone. Non-privileged callers never reach
  -- either branch — the pin above has already restored `OLD`.
  if new.verified and not old.verified then
    new.verified_at := coalesce(new.verified_at, now());
    new.verified_by := coalesce(new.verified_by, (select auth.uid()));
  elsif not new.verified and old.verified then
    new.verified_at := null;
    new.verified_by := null;
  end if;

  return new;
end;
$$;

create trigger credentials_guard
  before insert or update on public.practitioner_credentials
  for each row execute function public.credentials_guard();

-- ---------------------------------------------------------------------------
-- catalogue_guard, and the declared correction
-- ---------------------------------------------------------------------------

-- Two jobs, and the second one is why this could not ship with the catalogue in
-- `20260820201450_catalogues.sql`: its body reads `practitioner_credentials`, a
-- plpgsql body resolves its names at call time, and there was no claim to protect
-- until now.
--
-- It bumps `updated_at`, which is otherwise never written after insert on a table
-- whose stated correction path is an admin `UPDATE`. And it refuses a change to
-- `kind`, `platform` or `label` on an entry that has claims against it, unless the
-- caller has declared the change a correction.
--
-- `active` and `on delete restrict` both act on *deletion*, so before this the
-- equally destructive repoint — editing an entry to name a different credential, so
-- that everybody's claim now says something they did not claim — was one statement
-- refused by a paragraph. `bluehex_admin` holds unrestricted `update` on the table.
-- That is the pattern `AGENTS.md` names on `verified`, and this is the trigger that
-- closes it.
--
-- Deliberately **not** the other available fix, clearing verification on the dependent
-- rows: that would drop every badge in the directory the first time an admin corrects
-- a typo, and would treat the repoint as something to compensate for rather than
-- something to refuse.
create function public.catalogue_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  -- The three watched columns are the ones that say which credential the entry *is* —
  -- what a claim renders, and therefore what the badge asserts. `course_url` is
  -- deliberately not among them: a page moving is a link correction, the credential is
  -- the same credential, and requiring the escape hatch for it would train admins to
  -- reach for the escape hatch.
  if (new.kind is distinct from old.kind
      or new.platform is distinct from old.platform
      or new.label is distinct from old.label)
     and current_setting('bluehex.catalogue_correction', true) is distinct from 'on'
     and exists (select 1 from public.practitioner_credentials c
                  where c.catalogue_id = old.id)
  then
    raise exception 'a claimed catalogue entry cannot be repointed'
      using errcode = '23514',
            hint = 'add a new entry and retire this one with active = false, '
                   'or call correct_catalogue_entry() if the wording is wrong';
  end if;

  return new;
end;
$$;

create trigger catalogue_guard
  before update on public.credential_catalogue
  for each row execute function public.catalogue_guard();

-- The rename path the guard appears to block is the reason the escape hatch exists: a
-- course Anthropic renames is an admin `UPDATE` rather than a second migration, and
-- Postgres cannot tell a wording fix from a repoint, because the two are the same
-- statement and differ only in intent. So intent is declared.
--
-- The trigger is the enforcement and this is only the signal, which is why it does not
-- repeat the mistake `assign_profile_owner()` was deleted for — an RPC that *is* the
-- enforcement can be bypassed by anyone holding the `update` grant, and this one
-- cannot be, because bypassing it means arriving at the trigger without the setting.
--
-- It takes all three watched columns rather than only the one being corrected, and
-- every caller passes the current value for the two it is not changing. The
-- alternative — nullable parameters meaning "leave this alone" — makes an omitted
-- argument and an intended `null` the same call, on the columns where getting it wrong
-- rewrites what somebody's badge asserts.
--
-- `security invoker` like the rest: an admin already holds `update` on the table, so
-- this borrows no privilege and adds no reach. `set_config(…, true)` is
-- transaction-local, so the setting does not survive into another caller's session —
-- **and it is turned back off before returning**, because transaction-local is not
-- statement-local. Left on, the declaration disarms the guard for everything that
-- follows it in the same transaction: an entry corrected and a second one repointed in
-- one transaction is refused only because of the reset. Nothing reaches that today, one
-- PostgREST request being one transaction, but the failure it would be is this file's
-- own least acceptable shape — silent, and in the direction of permitting.
create function public.correct_catalogue_entry(
  entry_id uuid, new_kind text, new_platform text, new_label text)
returns public.credential_catalogue language plpgsql
set search_path = ''
as $$
declare result public.credential_catalogue;
begin
  perform pg_catalog.set_config('bluehex.catalogue_correction', 'on', true);

  update public.credential_catalogue
     set kind = new_kind, platform = new_platform, label = new_label
   where id = entry_id
   returning * into result;

  if not found then
    raise exception 'no such catalogue entry' using errcode = 'P0002';
  end if;

  -- after the `found` check, not before it: `perform` assigns `FOUND` itself, so
  -- resetting the declaration first would make the check read this statement's result
  -- rather than the update's and no missing entry would ever be reported. The raise
  -- above aborts the transaction, which discards the setting on the failing path anyway
  perform pg_catalog.set_config('bluehex.catalogue_correction', 'off', true);

  return result;
end;
$$;

revoke execute on function public.correct_catalogue_entry(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.correct_catalogue_entry(uuid, text, text, text)
  to bluehex_admin;

-- ---------------------------------------------------------------------------
-- clear_profile_verification, and its three triggers
-- ---------------------------------------------------------------------------

-- One privileged function, called by three triggers. Each fires when something about
-- *who this profile is* has changed, and none of them is a change to a credential —
-- that case is `credentials_guard`'s clearing rule above.
--
-- It is privileged because a practitioner has no grant on `verified` and the clear has
-- to reach from the parent down to rows they cannot write. Narrow in the only way that
-- matters: it sets the flag false and can do nothing else. Nobody may call it directly
-- — it exists for the triggers, which reach it as their own owner.
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

-- **Departs from the spec (6/7): the trigger functions are `security definer` too.**
-- The spec makes `clear_profile_verification()` the only privileged function among the
-- triggers, and that cannot hold. A trigger function runs as the caller unless it says
-- otherwise, so a plain one would be a practitioner renaming their own profile,
-- calling a function every API role has just been revoked `execute` on — refused
-- `42501` on an ordinary profile edit. The one on contacts has a second reason: it
-- reads `practitioners.contact_id` and `practitioners.user_id`, both withheld from
-- `authenticated`, so even the lookup is refused. Same trap as #49's, one layer along:
-- a privileged function is only reachable from a privileged caller.
--
-- Both stay narrow the same way `clear_profile_verification` does — no parameters from
-- the caller, and the only reachable effect is a flag going false.
create function public.practitioners_clear_credentials()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.clear_profile_verification(new.id);
  return null;
end;
$$;

-- **The `when` clause is load-bearing, not decoration.** `update of name` fires when
-- `name` appears in the statement's `SET` list, *whether or not the value changed* —
-- and `supabase.from('practitioners').update(form)` round-trips the whole form object,
-- so without the guard every bio edit would clear every badge on the profile. That is
-- precisely the failure the design's incentive argument exists to avoid, arriving
-- through the back door. The negative test is what asserts this clause is present.
--
-- The badge asserts *this person* holds these credentials, which is why a rename
-- clears them at all.
create trigger practitioners_rename_clears_credentials
  after update of name on public.practitioners
  for each row when (old.name is distinct from new.name)
  execute function public.practitioners_clear_credentials();

-- Claiming changes which account the person is, which is a larger change than a
-- rename. `null → A` only: `A → null` is an unassignment, which forces `withdrawn` and
-- takes the profile out of the directory anyway, and `A → B` is refused outright by
-- `practitioners_guard`.
create trigger practitioners_claim_clears_credentials
  after update of user_id on public.practitioners
  for each row when (old.user_id is null and new.user_id is not null)
  execute function public.practitioners_clear_credentials();

-- The third is the one that is easy to miss. An unclaimed profile is claimed by
-- matching the claimer's verified account email against
-- `practitioner_contacts.contact_email` — so while `user_id is null`, that address is
-- not a contact detail, it is the lock, and anyone who can change it can redirect the
-- claim. Making the change clear the badge means a redirected claim inherits an
-- unverified profile, and it costs the legitimate case one re-check on a profile
-- nobody owns yet.
--
-- Once the profile *is* claimed the rule stops applying: the claim has already
-- happened and the address is back to being ordinary contact information the owner
-- edits freely. A version missing that condition would make every verified
-- practitioner lose their badge for updating their own email.
create function public.contacts_email_change_clears_credentials()
returns trigger language plpgsql security definer
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

-- ---------------------------------------------------------------------------
-- the admin write path
-- ---------------------------------------------------------------------------

-- `security invoker`, and no authorization logic inside: Postgres refuses the call to
-- anyone who is not `bluehex_admin`, and a hand-rolled check would be a second
-- authorization model that can disagree with the first. Functions in `public` are
-- executable by PUBLIC by default, so the `revoke` is the mechanism and is not
-- optional.
--
-- **Departs from the spec (7/7), in the smallest way: it returns the row.** The spec
-- gives the signature and not the body. Returning the credential matches
-- `approve_practitioner()` and `reject_practitioner()`, and it saves the caller a
-- second round trip to read back a column they are not granted anyway — `verified_at`
-- and `verified_by` are stamped here, not passed in.
create function public.set_credential_verified(credential_id uuid, value boolean)
returns public.practitioner_credentials language plpgsql
set search_path = ''
as $$
declare result public.practitioner_credentials;
begin
  update public.practitioner_credentials
     set verified    = value,
         -- provenance follows the flag rather than accumulating: a credential that is
         -- not verified was not verified by anybody, at no time
         verified_at = case when value then now() end,
         verified_by = case when value then (select auth.uid()) end
   where id = credential_id
   returning * into result;

  if not found then
    raise exception 'no such credential' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke execute on function public.set_credential_verified(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_credential_verified(uuid, boolean) to bluehex_admin;
