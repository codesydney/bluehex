"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdminStatus } from "./queue";

/**
 * The review queue's four writes. **The other half of the seam #72 left.**
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
 * Every action returns an `ActionOutcome` rather than throwing. A thrown error
 * out of a Server Action is replaced with a generic message in a production
 * build, and the errors that matter here are the specific ones — `23514` from
 * the ownership state machine, `42501` from a privilege the caller does not
 * hold. Those are exactly what a reviewer needs to read, so they are returned
 * where the shell can put them on screen.
 */

export type ActionOutcome = { ok: true } | { ok: false; message: string };

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
function refusal(error: { message: string; hint?: string | null }): ActionOutcome {
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
  if (lookup) return refusal(lookup);

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
 * **The account is named by id, and that is a gap rather than a design.** The
 * spec's rule is that a claim is checked against `practitioner_contacts.contact_email`,
 * and nothing reachable from PostgREST can resolve an address to an account:
 * `auth` is not an exposed schema. So the match is a human check made against
 * the contact address on screen, and the id is pasted. Closing it properly is a
 * `security definer` lookup, which is a migration and is on the pull request.
 */
export async function assignOwnerAction(
  profileId: string,
  accountId: string,
): Promise<ActionOutcome> {
  await requireAdmin("/admin");

  const account = accountId.trim();
  if (!UUID.test(account)) {
    return { ok: false, message: "That is not an account id. It is a uuid, from the account's own record." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("practitioners")
    .update({ user_id: account })
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
