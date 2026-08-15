"use client";

/**
 * The profile editor's shell. Holds the draft so the form has something to edit
 * and the live preview has something to draw.
 *
 * Nothing persists. `initialControlled` stands in for the two things a
 * practitioner does not own — `status`, and `verified` per credential — which
 * the form shows read-only and never offers a control for.
 */

import { useState } from "react";
import { initialControlled, initialDraft, type ProfileDraft } from "./draft";
import { ProfileForm } from "./profile-form";

export function ProfileEditor() {
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);

  return (
    <section className="container-x pt-32 pb-32 md:pt-40">
      <h1 className="display-2 max-w-3xl">Your profile</h1>
      <p className="mt-5 max-w-2xl text-t-muted">
        Publish what you do and the Claude credentials you hold. Bluehex checks the
        credentials and decides the badge — nothing on this form sets it.
      </p>

      <div className="mt-14">
        <ProfileForm draft={draft} onChange={setDraft} controlled={initialControlled} />
      </div>
    </section>
  );
}
