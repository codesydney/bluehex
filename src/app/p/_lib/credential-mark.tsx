/**
 * The credential furniture the drawer and the page both use.
 *
 * Trimmed when this surface settled: the variant fixtures and the identity
 * panel are gone, because the identity question they existed to force has an
 * answer and it now lives in `handles.ts` where the code that implements it is.
 */

import type { Credential } from "@/lib/practitioners";

export function earnedLabel(credential: Credential) {
  if (!credential.earnedAt) return "Working towards";
  const date = new Date(`${credential.earnedAt}T00:00:00Z`);
  return `Earned ${date.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

/**
 * The three states a credential can be in, as one mark: working towards, earned
 * but not yet checked, and verified. Distinguished by shape rather than by
 * colour alone, and each carries its own screen-reader text — the difference
 * between the second and third is the entire product.
 */
export function CredentialMark({ credential }: { credential: Credential }) {
  if (!credential.earnedAt) {
    return (
      <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border border-dashed border-stroke">
        <span className="sr-only">Working towards.</span>
      </span>
    );
  }
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
      <svg viewBox="0 0 10 10" className="size-2.5" fill="none" aria-hidden="true">
        <path
          d="M2 5.2 4 7.2 8 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">Verified by Bluehex.</span>
    </span>
  );
}
