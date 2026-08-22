"use client";

/**
 * The profile editor's shell. Holds the draft the form edits and the preview
 * draws, and mocks the one database trigger the preview has to be able to show.
 *
 * **It persists as of #14.** The draft is read from Postgres by the page and
 * written back by `save`, which is the Server Action in
 * `src/app/profile/_lib/actions.ts` — passed down rather than imported, because
 * this is a client component and the action carries the session that every
 * policy behind it is written against.
 *
 * `controlled` stands in for the two things a practitioner does not own —
 * `status`, and `verified` per credential — which the form shows read-only and
 * never offers a control for.
 *
 * **The one behaviour mocked here rather than merely displayed is
 * `credentials_guard()`**: editing what a credential claims clears the check of
 * it, and only Bluehex can put it back. It lives at this level because
 * `verified` does. Without it the editor asserted the rule in prose on the
 * Review step while the preview quietly contradicted it — and a preview showing
 * a rule beats a sentence claiming it, which is the argument the whole design
 * rests on.
 *
 * The clearing list is three columns: `catalogue_id`, `earned_at` and
 * `evidence_url`. `evidence_public` is deliberately not among them, exactly as
 * it is not in the trigger — see `claimEdited`, which is the only place the list
 * is written down on this side of the wire.
 */

import { useState } from "react";
import type { CatalogueEntry } from "@/lib/practitioners";
import {
  clearInvalidatedChecks,
  type BluehexControlled,
  type ProfileDraft,
} from "@/lib/profile-draft";
import type { SaveProfile } from "@/lib/profile-save";
import { ProfileForm } from "./profile-form";

export function ProfileEditor({
  initialDraft,
  initialControlled,
  catalogue,
  save,
  existing,
}: {
  initialDraft: ProfileDraft;
  initialControlled: BluehexControlled;
  catalogue: CatalogueEntry[];
  save: SaveProfile;
  /** Whether there is a row behind this form yet. It changes what the buttons
      say and what the Review step says about `status` — a profile that does not
      exist is not waiting on Bluehex, and telling somebody it is would be the
      form describing a queue it has not joined. */
  existing: boolean;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [controlled, setControlled] = useState<BluehexControlled>(initialControlled);

  const change = (next: ProfileDraft) => {
    setControlled((current) => clearInvalidatedChecks(draft, next, current));
    setDraft(next);
  };

  return (
    <ProfileForm
      draft={draft}
      onChange={change}
      controlled={controlled}
      catalogue={catalogue}
      save={save}
      existing={existing}
    />
  );
}
