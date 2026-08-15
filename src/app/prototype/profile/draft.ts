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
 *                 bio, focus)                    on practitioners
 *   grant update (name, headline, location, country_code, bio, focus)
 *                                                on practitioners
 *   grant insert (contact_email, contact_phone, contact_note)
 *                                                on practitioner_contacts
 *   grant insert (practitioner_id, source, label, earned_at, evidence_url,
 *                 evidence_public)               on practitioner_credentials
 *
 * What is deliberately absent is the point: `verified`, `verified_at`,
 * `verified_by`, `status`, `approved_at`, `approved_by`, `owner_assigned_at`
 * and `owner_assigned_by` are not here, because a practitioner cannot set them.
 * `BluehexControlled` below is how the editor shows them without offering them.
 */

export type CredentialSource = "Claude Certification" | "Anthropic Academy";

export type DraftCredential = {
  /** Client-side only, for React keys and for pairing with verification state. */
  key: string;
  source: CredentialSource;
  label: string;
  /** `earned_at date`. Null means working towards — and unverifiable. */
  earnedAt: string | null;
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
  /**
   * NOT IN THE SPEC YET — proposed here, which is what the prototype is for.
   *
   * The case is the `country_code` case again. `headline` is prose ("Staff
   * engineer, agent platforms") and `focus` is technology ("Agents", "MCP"), so
   * neither answers "show me the designers" — a closed set beside the free text
   * is the only thing that filters. Single-select rather than an array, because
   * `focus` is already the plural axis and a multi-select job function would let
   * everyone tick everything, which is how a filter stops narrowing anything.
   *
   * Nullable in the column, `""` in this model — a `<select>` has no null and
   * the unset option has to have a value. That is a form-model convenience and
   * must not travel into the DDL: `""` and `null` are different values to
   * `where job_function = ...`, only one of them can mean "not saying", and a
   * table holding both filters wrongly for the rest of its life. So whatever
   * writes this maps `""` to `null` on the way in, and the column needs a check
   * constraint rejecting `''` so it cannot arrive the other way — the spec's
   * `country_code text check (country_code ~ '^[A-Z]{2}$')` already does this
   * for the field beside it, which is why `countryCode` is `""` here safely.
   * `DraftCredential.earnedAt` answers the same question in the type instead,
   * as `string | null`, because a date input does have an empty state.
   *
   * If this survives the prototype it needs `job_function` added to the spec's
   * DDL, its practitioner-writable grant lists and the directory's filters
   * before #49 — no schema lands before the model it encodes is settled.
   */
  jobFunction: string;
  location: string;
  /** `country_code`. `""` here, null in the column — see `jobFunction` above. */
  countryCode: string;
  bio: string;
  focus: string[];
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

export const sources: CredentialSource[] = ["Claude Certification", "Anthropic Academy"];

/**
 * Job functions. Kept deliberately short — a long list filters as badly as free
 * text, because every extra option splits the same people into smaller buckets
 * until no chip has anyone behind it. No "Other": it reliably becomes the
 * largest bucket and means nothing, and leaving the field unset says the same
 * thing more honestly.
 */
export const jobFunctions = [
  "Engineering",
  "Product",
  "Design",
  "Data and analytics",
  "Research",
  "Content and docs",
  "Consulting",
  "Leadership",
];

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
    source: "Anthropic Academy",
    label: "",
    earnedAt: null,
    evidenceUrl: "",
    evidencePublic: false,
  };
}

/**
 * A part-filled draft, so the editor is judged with content in it rather than
 * empty. Deliberately mid-flow: one credential earned and verified, one still
 * being worked towards, and a profile still `pending`.
 */
export const initialDraft: ProfileDraft = {
  name: "Mara Ellison",
  headline: "Staff engineer, agent platforms",
  jobFunction: "Engineering",
  location: "Sydney",
  countryCode: "AU",
  bio: "Builds evaluation harnesses for tool-using agents. Ten years in distributed systems before that, which mostly taught me how to make failures legible.",
  focus: ["Agents", "Evals", "MCP"],
  contactEmail: "mara@example.invalid",
  contactPhone: "",
  contactNote: "Best reached weekday mornings.",
  credentials: [
    {
      key: "c1",
      source: "Anthropic Academy",
      label: "Building with the Claude API",
      earnedAt: "2026-01-22",
      evidenceUrl: "https://example.invalid/certificate/mara-ellison",
      evidencePublic: true,
    },
    {
      key: "c2",
      source: "Claude Certification",
      label: "Claude Certification",
      earnedAt: null,
      evidenceUrl: "",
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
 * Whether an edit to a credential invalidates the check of it — the four
 * columns `credentials_guard()` clears `verified` on, in the spec's own order:
 * `source`, `label`, `earned_at`, `evidence_url`.
 *
 * `evidencePublic` is deliberately absent, exactly as it is from the trigger:
 * it changes the claim's visibility, not the claim. That exemption is the one a
 * practitioner most needs to hear, because the opt-in is the toggle that should
 * be easy to say yes to and "this costs you your badge" is a reason to leave it
 * off.
 */
export function claimEdited(before: DraftCredential, after: DraftCredential) {
  return (
    before.source !== after.source ||
    before.label !== after.label ||
    before.earnedAt !== after.earnedAt ||
    before.evidenceUrl !== after.evidenceUrl
  );
}

/**
 * The badge rollup, as the spec states it. Shown in the editor read-only, so a
 * practitioner can see why they do or do not have a badge without being given
 * anything that would let them change it.
 */
export function badgeState(draft: ProfileDraft, controlled: BluehexControlled) {
  const earned = draft.credentials.filter((credential) => credential.earnedAt);
  const verified = earned.filter((credential) => controlled.verified[credential.key]);
  return {
    shows: earned.length > 0 && verified.length === earned.length,
    earned: earned.length,
    verified: verified.length,
    inProgress: draft.credentials.length - earned.length,
  };
}
