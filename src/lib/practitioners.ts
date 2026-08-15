/**
 * The published practitioner directory.
 *
 * The premise: anyone in the Code.Sydney community can build a public profile
 * that collects their Claude credentials — Anthropic Academy certificates and
 * Claude Certifications alike — so employers and customers can find them.
 * Both the already-certified and the working-towards are listed; the status is
 * shown rather than used as a filter for entry.
 *
 * REAL PEOPLE ONLY. Nothing here is placeholder copy — a profile goes in when
 * the person has agreed to be published and the credentials have been checked.
 * The home page renders an invitation for the empty directory rather than
 * inventing entries.
 *
 * These types are the *public* view of a profile, and they deliberately mirror
 * the columns `anon` is granted in `docs/spec/profile-and-credentials.md` —
 * nothing more. The directory is an anonymous read, so a field absent from that
 * grant list is one the page can never render, and putting it here would only
 * invite a component to reach for it. Notably absent: `status`, `user_id`, and
 * the raw `evidence_url` (only the practitioner's published one survives).
 *
 * Fields are camelCase here and snake_case in Postgres; the mapping happens
 * where the query does, which is #53.
 *
 * CONTEXT.md notes that naming this type `Practitioner` conflates the human
 * with the record — strictly it is a Profile. Left alone for now because the
 * rename reaches the component, its file and its props; it belongs with #53.
 */

export type CredentialSource = "Claude Certification" | "Anthropic Academy";

export type Credential = {
  source: CredentialSource;
  label: string;
  /**
   * The day it was earned, `YYYY-MM-DD`. Null means working towards — and a
   * working-towards credential is inherently unverifiable, so it sits outside
   * the badge rollup entirely rather than counting against it.
   */
  earnedAt: string | null;
  /**
   * Bluehex checked the evidence behind *this credential*. Verification is per
   * credential and never per profile: Bluehex checks certificates one at a
   * time, and "three credentials, two checked" is a real state that a
   * profile-level boolean cannot hold. Only Bluehex sets this.
   */
  verified: boolean;
  /**
   * The certificate URL, but only when the practitioner chose to publish it —
   * this is the generated `evidence_url_public` column, which is null unless
   * `evidence_public` is true. A verified credential with no link here is
   * normal, not missing data: publishing a Skilljar page exposes the holder's
   * full legal name, so it is their call.
   */
  evidenceUrl: string | null;
};

export type Practitioner = {
  id: string;
  name: string;
  /** What they do, in a line. Called `headline` in the schema, not `role`. */
  headline: string | null;
  /** Free text, at whatever granularity the practitioner chose. Not filterable. */
  location: string | null;
  /**
   * ISO 3166-1 alpha-2. Separate from `location` because a machine cannot
   * reliably derive one from the other — this is what the location filter
   * groups on, and what a flag would be drawn from.
   */
  countryCode: string | null;
  bio: string | null;
  focus: string[];
  credentials: Credential[];
};

/**
 * Whether the profile shows the Verified badge.
 *
 * Derived, never stored — consistent with `certified`, which is not stored
 * either and is simply "has an earned Claude Certification credential".
 *
 * The rule: at least one earned credential, and every earned credential
 * verified. In-progress credentials are excluded rather than counted as
 * unverified, because counting them would permanently deny the badge to anyone
 * working towards a certification — a group this directory exists to include.
 *
 * Cheap because the directory fetches every profile and filters in the browser.
 * Materialise it into a column when that stops being true.
 */
export function hasVerifiedBadge(credentials: Credential[]) {
  const earned = credentials.filter((credential) => credential.earnedAt);
  return earned.length > 0 && earned.every((credential) => credential.verified);
}

/**
 * Where a profile lives.
 *
 * `mara-ellison-9f3c1a`: the short id is what resolves and the slug is
 * decoration, so a rename changes the URL without breaking the old one — the
 * route reads only the trailing id and serves a canonical redirect when the
 * slug no longer matches. Readable enough to paste into a job application,
 * which is the reason a profile has a URL at all.
 *
 * The id is the first six characters of the row's uuid. It must never be
 * derived from the name: hashing the name would move the id whenever the name
 * changed, which is the exact failure this scheme exists to prevent.
 */
export function profilePath(person: Pick<Practitioner, "id" | "name">) {
  const slug = person.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `/p/${slug}-${person.id.slice(0, 6)}`;
}

/* `Intl` already ships every country name, so a lookup table here would be a
   few kilobytes of data to maintain for no gain. Built once, not per render. */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "AU" → "Australia". Falls back to the code if it is not a known region. */
export function countryName(code: string) {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export const practitioners: Practitioner[] = [];
