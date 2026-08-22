import type { ProfileWrite } from "@/lib/profile-draft";

/**
 * Submitting a profile — the other half of the seam, and the half that is not
 * built.
 *
 * #71 stops here on purpose. What is missing is not a function body: it is the
 * two-request creation problem (`practitioner_contacts` is written first and
 * `practitioners.contact_id` is `not null`, so an abandoned submission leaves
 * an orphaned contact row), the policies that decide who may write which
 * column, and a Server Action to carry a session while it happens. All of that
 * is #14, and half of it built here would be built twice.
 *
 * **It returns a refusal rather than pretending, and that is the design.** A
 * button that reported success would be the one lie this form cannot afford,
 * on a page whose subject is who decides what. The refusal is what the editor
 * renders, and it names the reason.
 *
 * The signature is what #14 inherits: it takes `ProfileWrite`, which is where
 * the `"" → null` and `"" → do not submit this row` mappings have already
 * happened, and it is `async` because the real one is two round trips.
 */

export type SaveResult = { ok: true } | { ok: false; message: string };

const NOT_WIRED_UP =
  "Everything here checks out, and nothing was sent. Submitting a profile is not " +
  "switched on yet — this editor collects and validates the whole record, and the step " +
  "that writes it to Bluehex is still being built. Nothing you type is saved.";

/* eslint-disable-next-line @typescript-eslint/no-unused-vars --
   The parameter is the signature #14 inherits, and it is deliberately named
   rather than dropped: a seam whose shape is already agreed is the point of
   stopping here. There is nothing yet to send it to. */
export async function submitProfile(payload: ProfileWrite): Promise<SaveResult> {
  return { ok: false, message: NOT_WIRED_UP };
}
