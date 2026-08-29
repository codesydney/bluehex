"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdminStatus } from "./queue";

/**
 * The review queue's four writes, and the one read that belongs beside them.
 * **The other half of the seam #72 left.**
 *
 * Each one is a Server Action, and the client shell in `../review-queue` wraps
 * them into the `QueueActions` object the components were always handed. That
 * indirection is what made this ticket a change to one object rather than to
 * every button: nothing below the shell talks to PostgREST, and nothing below
 * it knows a write happened anywhere but locally.
 *
 * ## Postgres decides, not this file
 *
 * Every function opens with `requireAdmin`, and **that call is presentation**.
 * It exists so a session that expired between the render and the click meets the
 * sign-in form rather than a refusal nobody can read. The privileges themselves
 * belong to the `bluehex_admin` role: `approve_practitioner`,
 * `reject_practitioner` and `set_credential_verified` are `revoke`d from
 * `authenticated` outright, and `practitioners_guard` pins `status`, `user_id`
 * and every provenance column for any other caller. Deleting the guard from
 * these functions would make them ugly, not insecure — see
 * `docs/adr/0001-admins-are-a-postgres-role.md`.
 *
 * **There is no service role key anywhere in this path, and adding one would be
 * a decision rather than a step.** The client is the per-request one from
 * `@/lib/supabase/server`, carrying the reviewer's own token.
 *
 * **There is no verify-a-profile action, and there must never be one.**
 * Verification is per credential; the profile-level badge is a rollup of
 * credential rows and is stored nowhere. `QueueActions` says so in its type as
 * well as in the markup, and this file has no fifth export to contradict it.
 *
 * ## Failures come back as values
 *
 * Every action returns a value rather than throwing. A thrown error out of a
 * Server Action is replaced with a generic message in a production build, and
 * the errors that matter here are the specific ones — `23514` from the ownership
 * state machine, `42501` from a privilege the caller does not hold. Those are
 * exactly what a reviewer needs to read, so they are returned where the shell
 * can put them on screen.
 */

/**
 * What a write reports back.
 *
 * `notice` is for the case that has no other honest answer: the write landed
 * and something after it did not. Reporting that as `ok: false` would tell an
 * admin to retry a change Postgres has already committed, and reporting it as a
 * bare success would hide a public page still serving the old badge.
 */
export type ActionOutcome = { ok: true; notice?: string } | Refusal;

/** How anything on this screen fails: in Postgres's own words. */
type Refusal = { ok: false; message: string };

/**
 * What the account lookup reports.
 *
 * `email` is null when nothing came back, which covers both an id that names no
 * account and an account carrying no address, because `account_emails()` drops
 * the second rather than returning a row with a hole in it. The screen does not
 * distinguish them and could not act on the difference if it did: either way
 * there is no address to compare.
 *
 * A separate type rather than a widened `ActionOutcome`. Success here carries an
 * answer, and an answer is not a notice.
 */
export type AccountLookup = { ok: true; email: string | null } | Refusal;

/** A uuid, checked before it is sent, so an obvious typo reads as one. Postgres
    answers `22P02 invalid input syntax for type uuid` otherwise, which names the
    type rather than the mistake. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What went wrong, in the words Postgres used.
 *
 * The `hint` is carried through because the one raise in this schema puts the
 * repair in it — `practitioners_guard` refuses `A → B` with "unassign the
 * profile first, then claim it", and the message alone leaves a reviewer
 * looking for a button that does not exist.
 */
function refusal(error: { message: string; hint?: string | null }): Refusal {
  return { ok: false, message: error.hint ? `${error.message} — ${error.hint}` : error.message };
}

/**
 * Purge what the public sees.
 *
 * **The minimal, obvious thing, and deliberately not a scheme.** `/` and
 * `/p/<handle>` are cached on a daily clock, which bounds a revoked badge at 24
 * hours rather than closing it; these two calls close it for the pages a write
 * actually changed. The tag-based contract `src/app/page.tsx` names —
 * `practitioners` and `practitioner:<id>` — needs either a `fetch` to hang
 * `next.tags` on, which a `supabase-js` query is not, or `cacheTag()` inside a
 * `use cache` function, which needs `cacheComponents` turned on for the whole
 * application. Choosing between those is **#117** and is not this ticket's to
 * settle; `revalidatePath` needs neither and works today.
 *
 * The handle comes from the row the write returned rather than from the client,
 * so a purge always names the profile Postgres actually changed.
 *
 * Not called for a review note: a note is read by its subject and by nobody
 * else, so no public page changes when one is written.
 */
function purgePublicPages(handle: string) {
  revalidatePath("/");
  revalidatePath(`/p/${handle}`);
}

/** The queue itself, so the reviewer sees the row Postgres now holds rather than
    the one this render started with. The screen keeps no working copy — there is
    no optimistic edit for a failed write to leave behind. */
function purgeQueue() {
  revalidatePath("/admin");
}

/**
 * Publish a profile, take it down, or put it back in the queue.
 *
 * Three statuses for four, and the missing one is not an oversight: `withdrawn`
 * is the practitioner's own lever, and `AdminStatus` will not carry it.
 *
 * `approved` and `rejected` go through their RPCs, which do more than set a
 * column — approving deletes the rejection note, because an approved row carries
 * no rejection feedback, and rejecting writes one. `pending` has no RPC and is a
 * plain `PATCH`; `practitioners_guard` clears `approved_at` and `approved_by` on
 * the way out, so a profile taken back off the directory stops claiming an
 * approval that was withdrawn.
 *
 * **A rejection needs a note, and the schema is what says so.**
 * `practitioner_review_notes.note` is `not null`, so there is no rejecting
 * somebody without telling them why. The shell refuses to call this without one
 * rather than sending an empty string past a constraint that would accept it.
 */
export async function setStatusAction(
  profileId: string,
  status: AdminStatus,
  note?: string,
): Promise<ActionOutcome> {
  await requireAdmin("/admin");
  const supabase = await createServerSupabaseClient();

  if (status === "approved") {
    const { data, error } = await supabase.rpc("approve_practitioner", { profile_id: profileId });
    if (error) return refusal(error);

    purgePublicPages(data.handle);
    purgeQueue();
    return { ok: true };
  }

  if (status === "rejected") {
    const reason = note?.trim();
    if (!reason) {
      return { ok: false, message: "A rejection needs a note. The practitioner reads it." };
    }

    const { data, error } = await supabase.rpc("reject_practitioner", {
      profile_id: profileId,
      note: reason,
    });
    if (error) return refusal(error);

    purgePublicPages(data.handle);
    purgeQueue();
    return { ok: true };
  }

  const { data, error } = await supabase
    .from("practitioners")
    .update({ status: "pending" })
    .eq("id", profileId)
    .select("handle")
    .single();
  if (error) return refusal(error);

  purgePublicPages(data.handle);
  purgeQueue();
  return { ok: true };
}

/**
 * Check one credential, or take a check back.
 *
 * `set_credential_verified()` is the only door: `verified` is absent from the
 * `authenticated` update grant *and* pinned by `credentials_guard`, which is the
 * belt-and-braces `AGENTS.md` calls the most load-bearing line in the schema.
 * `verified_at` and `verified_by` are stamped inside the function from
 * `auth.uid()` rather than passed in, so the attestation records the human who
 * pressed the button and cannot record anybody else.
 *
 * The profile to purge is read off the returned row rather than taken from the
 * caller, so the pages that change are the ones Postgres says changed.
 */
export async function setVerifiedAction(
  credentialId: string,
  verified: boolean,
): Promise<ActionOutcome> {
  await requireAdmin("/admin");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("set_credential_verified", {
    credential_id: credentialId,
    value: verified,
  });
  if (error) return refusal(error);

  const { data: profile, error: lookup } = await supabase
    .from("practitioners")
    .select("handle")
    .eq("id", data.practitioner_id)
    .single();

  /* `set_credential_verified()` has already committed by here. A failure of the
     lookup that follows it is not a failure of the write, and saying otherwise
     would send the admin back to click Verify again over a change that landed.
     The directory is purged either way — it is the one page whose path is known
     without the handle — and only the profile page is left stale, which is what
     the notice says. */
  if (lookup) {
    revalidatePath("/");
    purgeQueue();
    return {
      ok: true,
      notice:
        "The check was saved. The practitioner's own page could not be refreshed, so it " +
        "may show the previous badge for up to a day — reading the profile back failed: " +
        lookup.message,
    };
  }

  purgePublicPages(profile.handle);
  purgeQueue();
  return { ok: true };
}

/**
 * Bluehex's feedback to one practitioner.
 *
 * A row rather than a column on the profile, because a column cannot be scoped
 * to the person it is about — `select (review_note)` granted to `authenticated`
 * would have let every signed-in practitioner read Bluehex's opinion of every
 * other one. The owner reads it through `review_notes_read_own` and writes it
 * never; `anon` has no grant on the table by any route.
 *
 * Clearing the text deletes the row rather than storing an empty one. `note` is
 * `not null` and would accept `''`, which would show the practitioner a note
 * saying nothing, dated today, attributed to whoever emptied it.
 *
 * `written_by` is set on the way in because the column has no default; on an
 * edit `review_notes_guard` moves both stamps itself whenever the text changes,
 * so the two write paths agree.
 *
 * No public purge: nothing anybody but the owner can see has changed.
 */
export async function setNoteAction(profileId: string, note: string): Promise<ActionOutcome> {
  const viewer = await requireAdmin("/admin");
  const supabase = await createServerSupabaseClient();
  const text = note.trim();

  if (!text) {
    /* A rejection carries its reason, and this is the only path that could take
       it away afterwards. `setStatusAction` refuses to reject without a note and
       `reject_practitioner()` writes one in the same statement that sets the
       status, so deleting it here would produce by the back door exactly the
       state those two exist to prevent: a practitioner reading a refusal with no
       explanation. Deleting a note on a pending or approved profile is fine and
       is the point of the button. */
    const { data: profile, error: status } = await supabase
      .from("practitioners")
      .select("status")
      .eq("id", profileId)
      .single();
    if (status) return refusal(status);

    if (profile.status === "rejected") {
      return {
        ok: false,
        message:
          "A rejected profile keeps its note. The practitioner reads it — put the profile " +
          "back to pending first if the reason no longer stands.",
      };
    }

    const { error } = await supabase
      .from("practitioner_review_notes")
      .delete()
      .eq("practitioner_id", profileId);
    if (error) return refusal(error);

    purgeQueue();
    return { ok: true };
  }

  const { error } = await supabase
    .from("practitioner_review_notes")
    .upsert(
      { practitioner_id: profileId, note: text, written_at: new Date().toISOString(), written_by: viewer.id },
      { onConflict: "practitioner_id" },
    );
  if (error) return refusal(error);

  purgeQueue();
  return { ok: true };
}

/**
 * Hand an unclaimed profile to an account.
 *
 * **An ordinary `PATCH` of `user_id`, with no RPC in the path**, which is what
 * the spec settled: `practitioners_guard` stamps `owner_assigned_at` and
 * `owner_assigned_by` on any change to the column, so the provenance is written
 * whether or not the caller thought about it — an RPC would have recorded it
 * only for callers who chose to use one.
 *
 * The state machine is the trigger's and this function does not restate it.
 * `null → A` claims, and clears the badge, because claiming changes which
 * account the person is. `A → null` unassigns and forces `withdrawn`. `A → B`
 * raises `23514` for everybody, admins included — a profile is a record about a
 * person and there is no story where the record about one person becomes
 * another's — and the repair is to unassign first, which is what the hint says.
 *
 * **The account is named by id, and the match is a human's to make.** The
 * spec's rule is that a claim is checked against
 * `practitioner_contacts.contact_email`; `lookupAccountAction` below puts the
 * account's address on the panel so both sides of that comparison are legible,
 * and nothing compares them. An override is exactly where social engineering
 * comes back, which is why the spec asks for a human check rather than a
 * mechanism, and why nothing here may grow into one.
 */
export async function assignOwnerAction(
  profileId: string,
  accountId: string,
): Promise<ActionOutcome> {
  await requireAdmin("/admin");

  /* An empty field unassigns. That is not a convenience: `practitioners_guard`
     refuses `A → B`, so unassigning is the *only* repair for a profile handed to
     the wrong account, and the spec leans on it — "a mis-assignment is still
     recoverable without database access: unassign (`A → null`, which withdraws
     the profile while its ownership is in question), then claim it to the right
     account". Without this branch that sentence is false and the repair needs
     psql. The guard forces `withdrawn` on the way out, so the profile leaves the
     directory while its ownership is in question rather than staying published
     with nobody behind it. */
  const account = accountId.trim();
  if (account !== "" && !UUID.test(account)) {
    return { ok: false, message: "That is not an account id. It is a uuid, from the account's own record." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("practitioners")
    .update({ user_id: account === "" ? null : account })
    .eq("id", profileId)
    .select("handle")
    .single();
  if (error) return refusal(error);

  /* Claiming clears every credential's `verified` through
     `practitioners_claim_clears_credentials`, so the badge on the public page
     has just changed. */
  purgePublicPages(data.handle);
  purgeQueue();
  return { ok: true };
}

/**
 * The address behind an account id, so a reviewer can check a claim.
 *
 * No `revalidatePath` and no `purgeQueue`: nothing here moves a row.
 *
 * It goes through `account_emails()`, which `bluehex_admin` alone may execute,
 * and which is the only door: see the migration for why its execute grant is the
 * whole of what protects it.
 *
 * **It reports the address and stops.** Comparing it against the contact email
 * is the reviewer's, and building that comparison here is the thing
 * `docs/spec/profile-and-credentials.md` refuses on purpose. A screen that said
 * "these match" would turn a human decision into an automatic one at exactly the
 * point where the human decision is the control.
 */
export async function lookupAccountAction(accountId: string): Promise<AccountLookup> {
  await requireAdmin("/admin");

  /* Checked before it is sent, for the reason the regex exists: Postgres answers
     `22P02 invalid input syntax for type uuid`, which names the type rather than
     the mistake. `assignOwnerAction` treats a pasted id the same way, and an id
     that would be refused there should not be accepted here. An empty field is
     refused too, unlike there, where emptiness means unassign and is the repair
     the whole panel rests on. */
  const account = accountId.trim();
  if (!UUID.test(account)) {
    return {
      ok: false,
      message: "That is not an account id. It is a uuid, from the account's own record.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("account_emails", { ids: [account] });
  if (error) return refusal(error);

  /* Empty means no answer, and the two ways to get there are an id naming no
     account and an account with no address. Neither is something a reviewer can
     act on differently, so the screen says the same thing about both. */
  return { ok: true, email: data[0]?.email ?? null };
}
