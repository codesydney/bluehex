/**
 * The published practitioner directory.
 *
 * The premise: anyone in the Code.Sydney community can build a public profile
 * that collects their Claude credentials — Anthropic Academy certificates and
 * Claude Certifications alike — so employers and customers can find them.
 * Holding nothing yet is not a bar to being listed: a profile with no
 * credentials is a normal profile, and what somebody is working through is
 * their own prose in `bio` rather than a row claiming it.
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

/**
 * One credential that exists in the world, listed by Bluehex — a row of
 * `credential_catalogue`. Not anybody's claim to hold it: that is `Credential`
 * below, and keeping the two words apart is what lets progress be shown without
 * anyone asserting anything.
 *
 * The catalogue is the only source of credential names anywhere in the model.
 * `source` and `label` live here rather than on the practitioner's row, so
 * `source = 'Anthropic Academy'` with `label = 'Claude Certification'` is not a
 * representable state, and there is no free text for a practitioner to type an
 * AWS certification into.
 */
export type CatalogueEntry = {
  id: string;
  source: CredentialSource;
  label: string;
  /**
   * Retired entries are still readable and still render, because somebody who
   * earned a withdrawn course still earned it. `active` filters the *picker*,
   * which is a query rather than a visibility rule.
   */
  active: boolean;
  /** The Academy track has an order; alphabetical would scramble it. */
  sortOrder: number;
};

export type Credential = {
  /**
   * The catalogue entry this credential names — `catalogue_id` resolved. It is
   * embedded rather than referenced by id because the two surfaces that render
   * a credential need its label, and the query that fetches a profile embeds
   * the catalogue row alongside it. `entry.id` is the column.
   */
  entry: CatalogueEntry;
  /**
   * The day it was earned, `YYYY-MM-DD`, and never absent. There is no
   * in-progress credential: an entry a practitioner has not earned is simply an
   * entry they have not earned, and "held against the whole catalogue" is where
   * progress is shown instead.
   */
  earnedAt: string;
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

/**
 * What a visitor can buy. A closed set, held in DDL as a check constraint
 * rather than in a table, because unlike the credential catalogue this is
 * Bluehex's own vocabulary — it changes when the positioning does, which is a
 * decision a migration should announce.
 *
 * Short on purpose: every extra option splits the same people into smaller
 * buckets until no chip has anyone behind it. No "Other", which reliably
 * becomes the largest bucket and means nothing.
 *
 * Mirrored here as a union so the type says what the `<@` check says. A profile
 * may hold at most three, which the database enforces with `cardinality` —
 * a cap enforced only in a form is not a cap.
 */
export const services = [
  "One-to-one tutoring",
  "Team training",
  "Code review",
  "Implementation",
  "Architecture and advisory",
  "Evaluation and testing",
] as const;

export type Service = (typeof services)[number];

/** `cardinality(services) <= 3` on the column. Written once, so the form that
    shows the cap and the constraint that enforces it cannot drift apart. */
export const maxServices = 3;

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
  /**
   * What they *know* — free text, self-described, and no longer what the
   * directory filters on. It moved to the profile page when `services` took the
   * roster: knowing RAG does not tell a visitor whether they can hire you for
   * an afternoon, which is the question they arrived with.
   */
  focus: string[];
  /**
   * What they can be *hired for* — the directory's filter axis. At most three,
   * from the closed set above. Empty is legal and normal: a practitioner who
   * has not said what they sell appears in the directory and matches no service
   * filter, and requiring it would turn publishing a profile into declaring a
   * commercial offering.
   */
  services: Service[];
  /**
   * A sentence, not a calendar. "Evenings and weekends", "booked until March".
   * Read once, after a visitor is already interested, which is why it is free
   * text on the profile rather than something the roster filters on — and why
   * it does not breach the marketplace exclusion: it is a fact the practitioner
   * asserts, not state the application has to keep true.
   */
  availability: string | null;
  /**
   * Published links: a route to a *page*, not to a person. That is the test
   * that admitted them while `practitioner_contacts` still holds the email and
   * phone number and is unreachable by `anon` by any route.
   *
   * Outside the attested set, with `bio` and `focus`. A repository looks like
   * evidence of work and is not evidence *Bluehex checked* — editing one never
   * clears the badge. Constrained to `https://` at the database, because every
   * one of these is rendered as an `href` on a public page.
   */
  websiteUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  bookingUrl: string | null;
  credentials: Credential[];
};

/**
 * Whether the profile shows the Verified badge.
 *
 * Derived, never stored — consistent with `certified`, which is not stored
 * either and is simply "holds a credential whose catalogue entry carries
 * `source = 'Claude Certification'`".
 *
 * The rule: at least one credential, and every one of them verified. It used to
 * filter out the unearned first, so that a permanently unverifiable row could
 * not deny the badge forever to the people the directory exists to include.
 * There is nothing left to filter — every credential row is earned, and
 * therefore checkable — so the carve-out went with the premise rather than
 * being kept as a defensive `.filter`.
 *
 * An earned credential with no evidence URL now carries that weight instead,
 * and behaves differently on purpose: it *is* in the rollup and holds the badge
 * back until proof is supplied, which is something the practitioner can act on.
 *
 * Cheap because the directory fetches every profile and filters in the browser.
 * Materialise it into a column when that stops being true.
 */
export function hasVerifiedBadge(credentials: Credential[]) {
  return credentials.length > 0 && credentials.every((credential) => credential.verified);
}

/* There is deliberately no progress helper here, and the omission is the
   presentation decision rather than an oversight. "2 of 23" reads as
   encouragement on your own editor and as 9% to an employer, so the spec's
   recommendation is that the editor shows progress against the whole catalogue
   and the public surfaces show what somebody holds. Nothing public derives it,
   so a helper here would need a catalogue this module does not have and would
   exist only to be reached for. It lives with the editor, in
   `src/app/prototype/profile/draft.ts`, until there is a real editor to move it
   to. */

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
 *
 * Nothing yet guarantees those six characters are unique, and `findByHandle`
 * returns the first row that matches them \u2014 so a collision serves the wrong
 * profile rather than a 404. The enforcement has to be in the schema, and is
 * open on the review of #63.
 *
 * The slug is dropped rather than left empty when a name has no ASCII residue
 * \u2014 every character of "\u674e\u96f7" is stripped by the transliteration \u2014 because
 * `/p/-9f3c1a` leads with a bare hyphen where the readable half is meant to be.
 * `/p/9f3c1a` resolves identically and does not look broken.
 */
export function profilePath(person: Pick<Practitioner, "id" | "name">) {
  const slug = person.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `/p/${slug ? `${slug}-` : ""}${person.id.slice(0, 6)}`;
}

/* `Intl` already ships every country name, so a lookup table here would be a
   few kilobytes of data to maintain for no gain. Built once, not per render. */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * "AU" → "Australia", and "au" → "Australia" too.
 *
 * The uppercasing is not tidiness. `Intl.DisplayNames` is case-sensitive on the
 * region code and fails *silently* rather than throwing: `of("au")` returns
 * `"au"` straight back, so the `catch` never fires and a lowercase code renders
 * as a filter chip labelled `au`. Only a structurally invalid code such as
 * `"usa"` throws, which is the narrow case the `catch` actually covers.
 *
 * A `check (country_code ~ '^[A-Z]{2}$')` on the column when #53 writes the
 * table is worth pairing with this, so normalising here is not the only thing
 * between the database and a chip labelled `au`.
 */
export function countryName(code: string) {
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export const practitioners: Practitioner[] = [];

/**
 * Every credential that exists. Bluehex's own reference data, not anybody's
 * record — and empty for the same reason `practitioners` is: the real list has
 * not been compiled, and inventing course names Anthropic owns would put
 * plausible fiction on a page whose entire job is credibility.
 *
 * It is here rather than absent because the profile page takes it as a prop and
 * an empty catalogue degrades correctly: nothing to reveal, so the Earned /
 * Not earned / All control does not render at all. When the query lands this is
 * the seam it replaces.
 */
export const credentialCatalogue: CatalogueEntry[] = [];
