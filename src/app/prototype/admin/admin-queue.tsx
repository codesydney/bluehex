"use client";

/**
 * The review queue mock's shell. Holds the queue so the actions land somewhere
 * and the workflow can be walked end to end.
 *
 * Nothing persists and nothing is written. `setVerified` stamps `verifiedBy`
 * and `verifiedAt` the way the real trigger would, because who checked a
 * credential and when is the substance of the attestation rather than
 * bookkeeping around it.
 *
 * ## The decision-support round is over and this design won it
 *
 * Two alternatives were drawn against it — one that made you type the name you
 * read off the certificate before a check would take, one that laid the profile
 * out as a dossier with provenance on every field — and a third, a findings
 * triage list, was cut on implementation cost before it was judged. This shape
 * was preferred to all of them, so the variants and the switcher are gone. See
 * NOTES.md for what each was betting and what survived the round.
 */

import { useState } from "react";
import { admin, initialQueue, type QueueActions, type QueueProfile } from "./queue-data";
import { ReviewQueue } from "./review-queue";

export function AdminQueuePrototype() {
  const [queue, setQueue] = useState<QueueProfile[]>(initialQueue);

  const patch = (profileId: string, change: (profile: QueueProfile) => QueueProfile) =>
    setQueue((current) =>
      current.map((profile) => (profile.id === profileId ? change(profile) : profile)),
    );

  const actions: QueueActions = {
    /* Deliberately does NOT bump `updatedAt`. Drift means "the practitioner
       edited their profile since we checked it", and an admin changing the
       status is not that — bumping it here makes approving a profile you just
       verified put it straight back in the queue as drifted. NOTES.md called
       that false positive cheaper than a column to suppress; that was true when
       drift was only a marker, and stopped being true the moment drift became a
       reason to be in the queue. The real schema wants the drift timestamp
       moved by the practitioner-writable columns only, which is a trigger
       scoped to the same list the column grants already enumerate. */
    setStatus: (profileId, status) => patch(profileId, (profile) => ({ ...profile, status })),

    setVerified: (profileId, credentialId, verified) =>
      patch(profileId, (profile) => {
        /* Stamped when the button is clicked, not when the page last rendered.
           Nothing re-renders this page while an admin reads a profile, so a
           `now` captured in the render body records when the profile was opened
           — and a session that opens one at 23:50 and checks it at 00:05 dates
           the attestation yesterday. The badge means a named human looked on a
           given day, so the day is the one part that cannot be approximate. */
        const now = new Date().toISOString();

        const credentials = profile.credentials.map((credential) =>
          credential.id === credentialId
            ? {
                ...credential,
                verified,
                verifiedAt: verified ? now : null,
                verifiedBy: verified ? admin : null,
              }
            : credential,
        );
        /* Drift is `updated_at > verified_at`, so the marker only clears when
           the newest check is newer than the newest edit — and this stamp must
           only ever go up. A `max()` taken over the live rows alone is not
           monotonic: undoing the most recent check drops back to an older one,
           and `updated_at` is suddenly greater than a timestamp that moved
           underneath it, so a profile nobody edited reads "Edited since
           checked". Drift decides queue membership now, which makes that a
           phantom queue item rather than a cosmetic marker. Including the
           current value is the whole fix, and it is also the truer statement:
           undoing a check says something about one credential, and does not
           unmake the fact that a human looked at this profile on that day. */
        const stamps = [
          profile.lastVerifiedAt,
          ...credentials.map((credential) => credential.verifiedAt),
        ].filter((stamp): stamp is string => Boolean(stamp));
        return {
          ...profile,
          credentials,
          lastVerifiedAt: stamps.length ? stamps.sort().at(-1)! : null,
        };
      }),

    setNote: (profileId, note) =>
      patch(profileId, (profile) => ({ ...profile, reviewNote: note })),

    /* `null → A` claims a profile. `A → B` raises 23514 — admins included — so
       there is deliberately no way to reassign one here. */
    assignOwner: (profileId) =>
      patch(profileId, (profile) =>
        profile.owner ? profile : { ...profile, owner: profile.contactEmail },
      ),
  };

  return (
    <section className="container-x pt-32 pb-32 md:pt-40">
      <h1 className="display-2 max-w-3xl">Review queue</h1>
      <p className="mt-5 max-w-2xl text-t-muted">
        Two independent decisions, not one pipeline.{" "}
        <strong className="font-medium text-t-bright">Status</strong> is whether a profile is
        visible; <strong className="font-medium text-t-bright">Verified</strong> is whether a
        human read the evidence behind one credential. A profile can be published and
        unvouched for, and usually is.
      </p>
      <p className="mt-4 max-w-2xl text-sm text-t-muted">
        Nine invented people, four of them awkward on purpose. Marcus Bell is spam and
        should be quick; Tomas Novak is using somebody else&rsquo;s certificate and is only
        catchable by looking across profiles; Aroha Ngata is entirely legitimate and will
        trip any careless name check; Hae-Won Park cannot be verified at all and is not
        doing anything wrong.
      </p>

      <div className="mt-14">
        <ReviewQueue queue={queue} actions={actions} />
      </div>
    </section>
  );
}
