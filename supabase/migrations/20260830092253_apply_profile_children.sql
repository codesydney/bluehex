-- Applying a save to the two child tables, in one transaction.
--
-- PostgREST runs one request in one transaction and offers no way to span two, so a
-- save's whole effect on `practitioner_credentials` and `practitioner_services` has to
-- arrive as one request or it is not atomic at all. Split across several, the deletes
-- commit and a later refusal cannot take them back — and that refusal needs no crafted
-- payload, because `practitioner_services_cap` raises on the insert that would fill a
-- fourth slot and the credential removals have run by then. What is left is a
-- practitioner holding fewer credentials than they started with, on the table the
-- Verified badge attests to. `saveChildren` in `src/app/profile/_lib/actions.ts` is the
-- caller, and it builds the plan this takes.
--
-- ## It takes the plan rather than the state the practitioner wants
--
-- The obvious alternative is to take the state the practitioner wants — every
-- credential and every service — and let this function work out the difference against
-- what is stored. It cannot, and the reason is that "absent from the payload" has two
-- meanings the function cannot tell apart: the practitioner removed it, or the editor
-- was unable to draw it. `planServices` in `src/app/profile/_lib/profile-plan.ts` only
-- ever deletes a row the form could have shown, because a catalogue label an admin
-- renamed out from under the closed vocabulary in `src/lib/practitioners.ts` is dropped
-- from the draft on the way in — no chip can render it — and reading its absence as a
-- removal would delete it from every profile offering it, one save at a time, silently.
-- The ambiguity is created on the client, so re-reading the stored rows in here cannot
-- resolve it.
--
-- Naming the rows to remove is what makes that irrelevant: nothing is decided by
-- absence, so a row the editor never saw is never reached. **Do not change these
-- arguments into the desired state without moving that protection somewhere it still
-- holds** — the failure is a silent deletion, which is the same class of failure the
-- transaction above exists to end.
--
-- The column definition lists below expand `evidence_url` as `public.https_url` rather
-- than as text, so a link that is not `https://` is refused with `23514` by the domain
-- as the record is expanded, exactly as the column would have refused it.
--
-- ## `security invoker`, and this one is load-bearing
--
-- `credentials_guard` decides whether a caller may move `verified` by reading
-- `current_user` against an allow-list that includes `postgres`
-- (`20260820222040_practitioner_credentials.sql`). A function a migration creates is
-- owned by `postgres`, so inside a `security definer` one — and inside every trigger
-- the DML it issues fires — `current_user` is `postgres`, the caller counts as
-- privileged, and the pin holding `verified`, `verified_at` and `verified_by` to `OLD`
-- stops applying. The column grants are the other half of that invariant and they are
-- bypassed by a definer function too, so a definer version of this function is the one
-- door in the schema through which a practitioner's own save could carry an
-- attestation. Nothing here needs the escalation: every column this function writes is
-- in the `authenticated` grants already, and it reads none of the withheld ones.
--
-- No authorization is written inside, for the same reason `approve_practitioner()`
-- writes none: the three layers that were already deciding these writes go on deciding
-- them, and a check in here would be a second model free to disagree with the first.
-- The column grants keep `verified` out of reach, `credentials_rw_own` and
-- `services_rw_own` narrow a practitioner's statements to rows they own, and the two
-- triggers still fire.
--
-- **Every statement is bounded by `profile_id` as well, and that is scope rather than
-- authorization.** The inserts carry it because a new row has to belong to somebody;
-- the removals and the updates test it because this function applies a plan to *one*
-- profile, and without the condition they would apply it to whatever rows the caller
-- happens to be able to reach. For a practitioner those are the same set, since
-- `credentials_rw_own` and `services_rw_own` have already narrowed the statement. For
-- an admin they are not: `credentials_admin_all` and `services_admin_all` are
-- `using (true)`, so an admin's removals and updates would otherwise find another
-- profile's rows — and the update is the one worth naming, because it rewrites the
-- claim, `credentials_guard` clears the check on it, and what it leaves behind is a row
-- that still looks right to everybody but its owner.
--
-- **It closes no privilege**, and it is not pretending to. `bluehex_admin` holds
-- `update` and `delete` on both tables outright and reaches the same rows with one
-- request that never comes near here. What the condition buys is that the
-- practitioner's own save cannot be the door a mistyped id travels through, and that
-- the bound still holds if a later migration widens a policy by accident — which is the
-- argument `credentials_guard` rests on one table over.
--
-- ## It takes no practitioner id
--
-- The profile is read from `my_profile()`, which answers for whoever is asking.
-- `20260822050002_profile_own_reads.sql` gives the reason for the two reads there and
-- it is the same one: there is nothing to pass, and an argument would be the obvious
-- way to turn a write over your own rows into a write over somebody else's.

create function public.apply_profile_children(
  credential_removals uuid[],
  credential_updates jsonb,
  credential_inserts jsonb,
  service_removals uuid[],
  service_inserts uuid[]
)
returns void language plpgsql
set search_path = ''
as $$
declare profile_id uuid;
begin
  select p.id into profile_id from public.my_profile() p;

  if profile_id is null then
    raise exception 'no profile for this account' using errcode = 'P0002';
  end if;

  -- **Deletes go first, and both tables have a reason.**
  -- `practitioner_services_cap` counts rows and refuses the fourth, so swapping one
  -- service for another inserts into a full table unless the removal has already
  -- happened; `unique (practitioner_id, catalogue_id)` does the same to a credential
  -- moved from one row to another. Ordering the statements is cheaper than teaching
  -- either constraint about intent.
  delete from public.practitioner_credentials c
   where c.id = any(credential_removals) and c.practitioner_id = profile_id;
  delete from public.practitioner_services s
   where s.id = any(service_removals) and s.practitioner_id = profile_id;

  -- An unchanged row is not in this pile, decided by `planCredentials` rather than
  -- here. `credentials_guard` compares with `is distinct from`, so rewriting the same
  -- values would not clear a check either way; what the skipping actually protects is
  -- `updated_at`, which the owner reads and which would otherwise move every time
  -- somebody pressed Save on a credential they had not touched.
  update public.practitioner_credentials c
     set catalogue_id = u.catalogue_id,
         earned_at = u.earned_at,
         evidence_url = u.evidence_url,
         evidence_public = u.evidence_public
    from jsonb_to_recordset(credential_updates) as u(
      id uuid,
      catalogue_id uuid,
      earned_at date,
      evidence_url public.https_url,
      evidence_public boolean
    )
   where c.id = u.id and c.practitioner_id = profile_id;

  insert into public.practitioner_credentials
              (practitioner_id, catalogue_id, earned_at, evidence_url, evidence_public)
       select profile_id, i.catalogue_id, i.earned_at, i.evidence_url, i.evidence_public
         from jsonb_to_recordset(credential_inserts) as i(
           catalogue_id uuid,
           earned_at date,
           evidence_url public.https_url,
           evidence_public boolean
         );

  -- Services carry a catalogue reference and nothing else writable, so there is no
  -- update pile: an edit is a different row. `label` is absent from this insert and
  -- not merely left null — the rows carrying one were written by an admin during
  -- curated intake and this form has no control that produces them.
  --
  -- **It is also last, and that is worth keeping.** `practitioner_services_cap` takes
  -- `pg_advisory_xact_lock` keyed on the profile, and an `xact` lock is held until
  -- commit rather than released when the statement ends — so the only statement that
  -- fires it being the final one is the shortest hold this function can have. Moving it
  -- above the credential work would make every concurrent save of the same profile wait
  -- on the whole of the one ahead of it instead of on one insert. Nothing would report
  -- that: it is two tabs of one practitioner, and it comes back as slowness.
  insert into public.practitioner_services (practitioner_id, catalogue_id)
       select profile_id, s from unnest(service_inserts) as s;
end;
$$;

-- A pile that is empty is a pile that does nothing: `unnest('{}')` and
-- `jsonb_to_recordset('[]')` both yield no rows, and a `delete` or `update` matching
-- nothing raises nothing. So a save that changed only the profile itself still calls
-- this, and it is a no-op rather than a special case anybody has to remember.
--
-- Nothing raises when a removal matches no row either, and that is deliberate rather
-- than an omission. A stale tab asking to remove a credential another tab has already
-- removed is a concurrency problem — #129 — and it wants a token that detects the stale
-- read, not a refusal here that would also fire on the ordinary race.

revoke execute on function public.apply_profile_children(uuid[], jsonb, jsonb, uuid[], uuid[])
  from public, anon;
grant execute on function public.apply_profile_children(uuid[], jsonb, jsonb, uuid[], uuid[])
  to authenticated, bluehex_admin;

-- `bluehex_admin` is named although `grant authenticated to bluehex_admin` in the first
-- migration would carry `execute` in with the membership, matching `my_profile()` and
-- `my_credentials()`: an admin is a practitioner too, and their own profile should not
-- be editable by way of a role membership that exists for a different reason.
