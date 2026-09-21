import type { ProfileDraft } from "@/lib/profile-draft";

/**
 * What a save reports back, and the shape of the function that performs one.
 *
 * **The seam #71 drew, now filled from the other side.** This file used to hold
 * `submitProfile`, which returned a refusal saying the write was not built; the
 * write is `saveProfileAction` in `src/app/profile/_lib/actions.ts`, and it is
 * a Server Action rather than a plain function because it carries the
 * practitioner's session — `auth.uid()` is what every policy behind it is
 * written against.
 *
 * The types stay here rather than moving into that module for a reason the
 * runtime enforces: a `"use server"` file may export nothing but async
 * functions, and `src/components/profile-editor` is a client component that
 * needs the result type to render it. So the action travels as a prop from the
 * page, and the contract between them lives in a module both may import.
 *
 * `ok: false` carries a message a practitioner can act on, in Postgres's own
 * words where Postgres refused. There is no `ok: true` message: a save that
 * worked is reported by the form, which knows whether it was a first submission
 * or an edit, and this type should not have an opinion about copy.
 */
export type SaveResult =
  | {
      ok: true;
      /** `practitioners.updated_at` after the write. The form keeps it as the
          revision its next save is checked against; without it the second save
          from the same tab would be refused as stale. */
      revision: string;
    }
  | {
      ok: false;
      message: string;
      /** Present when the profile row was written before the refusal — the
          children failed — so a retry from the same tab is checked against the
          row as it now is rather than refused as stale. */
      revision?: string;
    };

/**
 * `ProfileDraft` rather than `ProfileWrite`, which is the correction #125 made
 * and is worth stating because the earlier signature reads better.
 *
 * Handing the writer the already-mapped payload made the browser responsible
 * for the `"" → null` and `"" → do not submit this row` rules, and left the
 * action with nothing it could validate: `validateDraft` is defined over the
 * draft, and by the time `""` has become `null` the difference between "not
 * saying" and "sent an empty name" is gone. So the draft travels, and the
 * action validates and maps it — `toWritePayload` is the same pure function,
 * called one hop later.
 */
/**
 * `revision` is `practitioners.updated_at` as the read served it, or null when
 * there was no row to read. It is the optimistic-concurrency token of #129: the
 * update is conditioned on the row still carrying it, so a tab that read the
 * profile before another tab saved it is refused rather than allowed to plan
 * its child rows against state it never saw.
 *
 * It travels as the string PostgREST produced and is never parsed. `Date` holds
 * milliseconds and the column holds microseconds, so a token that has been
 * through `new Date()` matches nothing, ever.
 */
export type SaveProfile = (draft: ProfileDraft, revision: string | null) => Promise<SaveResult>;
