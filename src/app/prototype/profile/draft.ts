/**
 * PROTOTYPE — the profile editor's draft model. Throwaway.
 *
 * This is the practitioner-writable field set and nothing else, read off the
 * grant lists in `docs/spec/profile-and-credentials.md`. Getting this list
 * right is most of the value of the prototype: `scope.md` requires phase-one
 * curated intake to collect the full phase-two field set even where it renders
 * only part of it, because "going back to twenty-five people to ask for a field
 * that was never collected is a fortnight of chasing humans, and it spends
 * goodwill with exactly the people the directory is trying to attract."
 *
 *   grant insert (user_id, contact_id, name, headline, location, country_code,
 *                 bio, focus, services, availability,
 *                 website_url, github_url, linkedin_url, booking_url)
 *                                                on practitioners
 *   grant update (name, headline, location, country_code, bio, focus,
 *                 services, availability,
 *                 website_url, github_url, linkedin_url, booking_url)
 *                                                on practitioners
 *   grant insert (contact_email, contact_phone, contact_note)
 *                                                on practitioner_contacts
 *   grant insert (practitioner_id, catalogue_id, earned_at, evidence_url,
 *                 evidence_public)               on practitioner_credentials
 *
 * What is deliberately absent is the point: `verified`, `verified_at`,
 * `verified_by`, `status`, `approved_at`, `approved_by`, `owner_assigned_at`
 * and `owner_assigned_by` are not here, because a practitioner cannot set them.
 * `BluehexControlled` below is how the editor shows them without offering them.
 *
 * `source` and `label` are absent for a different reason, and it is worth
 * keeping the two kinds of absence apart. They are not withheld from the
 * practitioner — they are not on the credential row at all. They belong to the
 * catalogue entry the row points at, so a credential names a credential and can
 * never describe one.
 */

import { claimableCount, entryByLabel } from "../catalogue";
import type { Service } from "@/lib/practitioners";

export type DraftCredential = {
  /** Client-side only, for React keys and for pairing with verification state. */
  key: string;
  /**
   * `catalogue_id`. `""` while nothing is picked, because a `<select>` has no
   * null and the unset option has to have a value — the same form-model
   * convenience the country code uses. It must not travel: the column is a
   * `not null` foreign key, so an unpicked credential is not a row the database
   * would accept, and whatever writes this refuses to submit rather than
   * mapping `""` to anything.
   */
  catalogueId: string;
  /**
   * `earned_at date`, and `not null` in the column. `""` here means the date
   * field has not been filled in yet, which is a state of the form and never a
   * state of a credential — there is no in-progress row to represent, and
   * nothing may be submitted without a date.
   */
  earnedAt: string;
  evidenceUrl: string;
  /**
   * `evidence_public boolean not null default false`. Private by default, and
   * the practitioner's call: publishing a Skilljar page exposes their full
   * legal name permanently, but early on a clickable certificate is worth more
   * to an employer than the word "Verified". Collected alongside the URL
   * rather than as a separate later step.
   */
  evidencePublic: boolean;
};

export type ProfileDraft = {
  name: string;
  headline: string;
  location: string;
  /**
   * `country_code`. `""` here, null in the column: a `<select>` has no null and
   * the unset option has to have a value. That is a form-model convenience and
   * must not travel into the DDL — `""` and `null` are different values to
   * `where country_code = ...`, only one of them can mean "not saying", and a
   * table holding both filters wrongly for the rest of its life. The spec's
   * `check (country_code ~ '^[A-Z]{2}$')` is what stops it arriving.
   */
  countryCode: string;
  bio: string;
  /** What they know. Free text, and no longer what the directory filters on. */
  focus: string[];
  /**
   * What they can be hired for, and the axis the directory filters on. Closed
   * set, at most `maxServices` from `@/lib/practitioners` — capped because a
   * multi-select everyone maxes
   * out is a filter that narrows nothing. The form shows the cap and enforces
   * it, and the column enforces it again with a `cardinality` check, because a
   * cap enforced only in a form is not a cap.
   */
  services: Service[];
  /** A sentence, not a calendar. Nullable in the column, `""` here. */
  availability: string;
  /**
   * Published links — a route to a page, not to a person, which is the test
   * that admitted them while the contact details below stay unpublished. `""`
   * for unset, and each is `https_url` in the column: the scheme is constrained
   * at the database because every one of these becomes an `href`.
   */
  websiteUrl: string;
  githubUrl: string;
  linkedinUrl: string;
  bookingUrl: string;
  /** `practitioner_contacts`. Never published — the enquiry routes via Bluehex. */
  contactEmail: string;
  contactPhone: string;
  contactNote: string;
  credentials: DraftCredential[];
};

/**
 * The two axes the practitioner does not own, shown read-only so the editor
 * says who decides what.
 *
 * They are independent rather than a sequence: `status` governs whether anyone
 * else can see the profile, `verified` governs whether the badge shows. A
 * profile can be approved and unverified — published but not vouched for — and
 * that is the normal case, not an edge case.
 */
export type BluehexControlled = {
  status: "pending" | "approved" | "rejected" | "withdrawn";
  /** Keyed by credential `key`. Verification is per credential, never per profile. */
  verified: Record<string, boolean>;
  /** Admin feedback, from `practitioner_review_notes`. The owner reads, never writes. */
  reviewNote: string | null;
};

/* `sources` used to be exported from here for the credential picker's first
   select. There is no such select any more, and the picker's `<optgroup>`s are
   derived from the catalogue's own sort order — one ordering fact rather than
   two that can disagree. `source` is still a two-value check constraint on the
   catalogue, because what it describes is weight, and unlike the list of course
   names that has not grown. */

/**
 * A short country list rather than the full ISO set. `Intl` exposes region
 * *names* but no list of region codes to enumerate, so a real implementation
 * needs a small data file; for a prototype this covers the community's actual
 * spread and keeps the question about the control, not the data.
 */
export const countries = [
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "IN", name: "India" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

/** Suggested focus areas. Free text underneath — `focus` is a `text[]`. */
export const focusSuggestions = [
  "Agents",
  "MCP",
  "Evals",
  "RAG",
  "Claude Code",
  "Prompt engineering",
  "Fine-tuning",
  "Architecture",
  "Data",
  "Frontend",
];

export function newCredential(): DraftCredential {
  return {
    key: Math.random().toString(36).slice(2),
    catalogueId: "",
    earnedAt: "",
    evidenceUrl: "",
    evidencePublic: false,
  };
}

/**
 * A part-filled draft, so the editor is judged with content in it rather than
 * empty. Deliberately mid-flow: two credentials, one checked and one waiting,
 * and a profile still `pending`.
 *
 * It used to hold one earned credential and one being worked towards, which is
 * no longer a row anybody can write. The mid-flow state it existed to draw is
 * kept — the second credential is earned and unchecked, which is the state a
 * practitioner is actually in while Bluehex works through the queue.
 */
export const initialDraft: ProfileDraft = {
  name: "Mara Ellison",
  headline: "Staff engineer, agent platforms",
  location: "Sydney",
  countryCode: "AU",
  bio: "Builds evaluation harnesses for tool-using agents. Ten years in distributed systems before that, which mostly taught me how to make failures legible. Working through the rest of the Academy track on weekends.",
  focus: ["Agents", "Evals", "MCP"],
  services: ["Architecture and advisory", "Evaluation and testing"],
  availability: "Evenings and weekends, and about one day a fortnight.",
  websiteUrl: "https://example.invalid/mara",
  githubUrl: "https://github.com/example-invalid",
  linkedinUrl: "",
  bookingUrl: "",
  contactEmail: "mara@example.invalid",
  contactPhone: "",
  contactNote: "Best reached weekday mornings.",
  credentials: [
    {
      key: "c1",
      catalogueId: entryByLabel("Building with the Claude API").id,
      earnedAt: "2026-01-22",
      evidenceUrl: "https://example.invalid/certificate/mara-ellison",
      evidencePublic: true,
    },
    {
      key: "c2",
      catalogueId: entryByLabel("Tool use and function calling").id,
      earnedAt: "2026-06-04",
      evidenceUrl: "https://example.invalid/certificate/mara-tools",
      evidencePublic: false,
    },
  ],
};

export const initialControlled: BluehexControlled = {
  status: "pending",
  verified: { c1: true, c2: false },
  reviewNote: null,
};

/**
 * Whether an edit to a credential invalidates the check of it — the three
 * columns `credentials_guard()` clears `verified` on, in the spec's own order:
 * `catalogue_id`, `earned_at`, `evidence_url`.
 *
 * It was four. `catalogue_id` replaces the `source` and `label` pair, which is
 * a simplification rather than a loss: changing which credential you claim is
 * the largest edit there is, and it is now one column.
 *
 * `evidencePublic` is deliberately absent, exactly as it is from the trigger:
 * it changes the claim's visibility, not the claim. That exemption is the one a
 * practitioner most needs to hear, because the opt-in is the toggle that should
 * be easy to say yes to and "this costs you your badge" is a reason to leave it
 * off.
 */
export function claimEdited(before: DraftCredential, after: DraftCredential) {
  return (
    before.catalogueId !== after.catalogueId ||
    before.earnedAt !== after.earnedAt ||
    before.evidenceUrl !== after.evidenceUrl
  );
}

/**
 * The badge rollup, as the spec states it. Shown in the editor read-only, so a
 * practitioner can see why they do or do not have a badge without being given
 * anything that would let them change it.
 *
 * It lost its `earned` filter with in-progress rows: every credential counts
 * now, because every credential is checkable.
 */
export function badgeState(draft: ProfileDraft, controlled: BluehexControlled) {
  const held = draft.credentials.length;
  const verified = draft.credentials.filter(
    (credential) => controlled.verified[credential.key],
  ).length;
  return { shows: held > 0 && verified === held, held, verified };
}

/**
 * Progress: how much of the catalogue this profile holds.
 *
 * Derived by comparing two sets, which is what replaced the in-progress
 * credential. Nobody asserts anything to make this number move — the catalogue
 * is Bluehex's, the holdings are checked, and "not yet" is the absence of a row
 * rather than a claim wearing the same shape as a verified one.
 *
 * **It is shown in the editor and nowhere else, deliberately.** "2 of 23" reads
 * as encouragement to its owner and as 9% to an employer, so the public profile
 * shows what somebody holds rather than what they lack. That is the spec's
 * recommendation and drawing it did not change my mind: on the Credentials step
 * the whole track is the motivating thing, and on a roster row the same number
 * would be a score nobody asked to be ranked by.
 */
export function catalogueProgress(draft: ProfileDraft) {
  return { held: draft.credentials.length, total: claimableCount };
}
