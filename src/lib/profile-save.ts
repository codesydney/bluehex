import type { ProfileWrite } from "@/lib/profile-draft";

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
export type SaveResult = { ok: true } | { ok: false; message: string };

/**
 * `ProfileWrite` rather than `ProfileDraft`, which is where the `"" → null` and
 * `"" → do not submit this row` mappings have already happened — see
 * `toWritePayload`. The editor never hands a form model to a writer.
 */
export type SaveProfile = (payload: ProfileWrite) => Promise<SaveResult>;
