"use client";

/**
 * The profile editor's shell. Holds the draft so the form has something to edit
 * and the live preview has something to draw.
 *
 * Nothing persists. `initialControlled` stands in for the two things a
 * practitioner does not own — `status`, and `verified` per credential — which
 * the form shows read-only and never offers a control for.
 *
 * The one piece of behaviour mocked here rather than merely displayed is
 * `credentials_guard()`: editing what a credential claims clears the check of
 * it, and only Bluehex can put it back. It lives at this level because
 * `verified` does. Without it the editor asserted the rule in prose on the
 * Review step while the preview quietly contradicted it — and the preview
 * showing a rule beats a sentence claiming it, which is the argument the whole
 * design rests on.
 *
 * The clearing list is three columns now rather than four: `catalogue_id`,
 * `earned_at` and `evidence_url`. `catalogue_id` absorbed the `source` and
 * `label` pair, so "which credential you claim" moved from two free-text fields
 * to one reference — see `claimEdited` in `draft.ts`, which is the only place
 * the list is written down.
 */

import { useState } from "react";
import {
  claimEdited,
  initialControlled,
  initialDraft,
  type BluehexControlled,
  type ProfileDraft,
} from "./draft";
import { ProfileForm } from "./profile-form";

export function ProfileEditor() {
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [controlled, setControlled] = useState<BluehexControlled>(initialControlled);

  const change = (next: ProfileDraft) => {
    const invalidated = next.credentials.filter((credential) => {
      const before = draft.credentials.find((item) => item.key === credential.key);
      return before && claimEdited(before, credential);
    });

    if (invalidated.length > 0) {
      setControlled((current) => ({
        ...current,
        verified: {
          ...current.verified,
          ...Object.fromEntries(invalidated.map((credential) => [credential.key, false])),
        },
      }));
    }

    setDraft(next);
  };

  return (
    <section className="container-x pt-32 pb-32 md:pt-40">
      <h1 className="display-2 max-w-3xl">Your profile</h1>
      <p className="mt-5 max-w-2xl text-t-muted">
        Publish what you do and the Claude credentials you hold. Bluehex checks the
        credentials and decides the badge — nothing on this form sets it.
      </p>

      <div className="mt-14">
        <ProfileForm draft={draft} onChange={change} controlled={controlled} />
      </div>
    </section>
  );
}
