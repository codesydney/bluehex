/**
 * How a credential's state is drawn, wherever it is drawn.
 *
 * Two surfaces render credentials — the roster row and the profile page — and
 * the distinction they carry is the product itself, so it is stated once here
 * rather than once per surface. It lived in both for a commit and had already
 * disagreed with itself about the date format; the states are what cannot be
 * allowed to drift, and the only way to guarantee that is one copy.
 *
 * In `src/components/` rather than beside either surface because the dependency
 * must not point from production code into a route's `_lib`.
 */

import type { Credential } from "@/lib/practitioners";

/** `earnedAt` is a date, not a timestamp — read and formatted as one. */
export function earnedLabel(credential: Credential) {
  const date = new Date(`${credential.earnedAt}T00:00:00Z`);
  return `Earned ${date.toLocaleDateString("en-AU", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

/**
 * The per-credential state, which is where all the nuance lives — the profile
 * badge stays binary and everything else is said here. Two states, and they
 * have to be distinguishable at a glance down a column:
 *
 *   verified  — a human at Bluehex read the evidence
 *   earned    — claimed, not yet checked
 *
 * Distinguished by shape rather than by colour alone, and each carries its own
 * screen-reader text — the difference between them is the entire product.
 *
 * There were three. The dashed ring meant "working towards", which is no longer
 * a credential a practitioner can enter: the catalogue shows the whole track
 * without anybody claiming a course they have not finished, so the state has
 * nothing left to draw rather than being drawn some other way.
 */
export function CredentialMark({ credential }: { credential: Credential }) {
  if (!credential.verified) {
    return (
      <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border border-stroke">
        <span className="size-1 rounded-full bg-t-faint" />
        <span className="sr-only">Earned, not yet checked by Bluehex.</span>
      </span>
    );
  }

  return (
    <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-ink text-t-invert">
      <Tick className="size-2.5" />
      <span className="sr-only">Verified by Bluehex.</span>
    </span>
  );
}

/* Exported because the roster's profile-level badge draws the same tick, and a
   second copy of the path data is how the marks drifted the first time. On a
   10-unit grid rather than the 24 the rest of `icons.tsx` uses, because it is
   only ever drawn at 10px inside a 16px dot. */
export function Tick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
      <path
        d="M2 5.2 4 7.2 8 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
