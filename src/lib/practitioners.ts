/**
 * The published practitioner directory, as types rather than as data.
 *
 * The premise: anyone in the Code.Sydney community can build a public profile
 * that collects their Claude credentials — Anthropic Academy certificates and
 * Claude Certifications alike — so employers and customers can find them.
 * Holding nothing yet is not a bar to being listed: a profile with no
 * credentials is a normal profile, and what somebody is working through is
 * their own prose in `bio` rather than a row claiming it.
 *
 * **This module holds no rows any more, and that is the change #53 made.** It
 * used to export `practitioners` and `credentialCatalogue` as empty arrays that
 * a page rendered directly; both are gone, and the pages read Postgres through
 * `@/lib/directory` instead. What is left here is the public *shape* — the view
 * model the query maps onto, plus the two derivations and the two string
 * helpers that go with it.
 *
 * REAL PEOPLE ONLY. The rule survives the array it used to guard, and it moved
 * to where the rows now live: a profile reaches the hosted project when the
 * person has agreed to be published, and nothing invented is ever inserted
 * there. `supabase/seed.sql` carries an invented population on purpose and is
 * the one place that is allowed to — it runs on a developer's machine and on a
 * CI runner and never against hosted. The home page still renders an invitation
 * for the empty slots rather than inventing entries to fill them.
 *
 * These types are the *public* view of a profile, and they deliberately mirror
 * the columns `anon` is granted in `docs/spec/profile-and-credentials.md` —
 * nothing more. The directory is an anonymous read, so a field absent from that
 * grant list is one the page can never render, and putting it here would only
 * invite a component to reach for it. Notably absent: `status`, `user_id`, and
 * the raw `evidence_url` (only the practitioner's published one survives).
 *
 * Fields are camelCase here and snake_case in Postgres. The mapping happens in
 * `@/lib/directory-mapping`, which is pure and tested; `@/lib/directory` is the
 * half that talks to the network.
 */

/**
 * The weight axis of a catalogue entry: is this a course somebody sat, or an
 * exam somebody passed.
 *
 * Lowercase because it is a closed internal category, following `status`'s
 * precedent. #103 split it out of the single `source` column, which carried the
 * weight and the awarding body in one string and let the two disagree.
 */
export type CredentialKind = "certification" | "course";

/**
 * One credential that exists in the world, listed by Bluehex — a row of
 * `credential_catalogue`. Not anybody's claim to hold it: that is `Credential`
 * below, and keeping the two words apart is what lets progress be shown without
 * anyone asserting anything.
 *
 * The catalogue is the only source of credential names anywhere in the model.
 * `kind`, `platform` and `label` live here rather than on the practitioner's
 * row, so there is no free text for a practitioner to type an AWS certification
 * into.
 */
export type CatalogueEntry = {
  id: string;
  kind: CredentialKind;
  /**
   * Who awards it — `Anthropic Academy` or `Pearson VUE`. A separate fact from
   * `kind` and from `courseUrl`: the certifications are examined by Pearson VUE
   * and described on a partner Skilljar tenant, which is the clearest evidence
   * the axes are genuinely independent.
   */
  platform: string;
  label: string;
  /** Where the entry is published. Null is legal — an entry Bluehex knows of
      before its page exists is still a real entry. */
  courseUrl: string | null;
  /**
   * Retired entries are still readable and still render, because somebody who
   * earned a withdrawn course still earned it. `active` filters the *picker*,
   * which is a query rather than a visibility rule.
   */
  active: boolean;
  /** The Academy track has an order; alphabetical would scramble it. */
  sortOrder: number;
};

/**
 * Catalogue order: courses before certifications, then `sortOrder`, then label.
 *
 * **`sortOrder` alone is not an order.** It restarts at 0 per platform — the
 * seed's own note says so, and `unique (kind, platform, label)` does not
 * constrain it — so a course and an exam collide on every low number. Sorting on
 * it by itself leaves the collisions to whatever order the rows arrived in,
 * which for a `select` is whatever Postgres found. The result is the Academy
 * track interleaved with the exams and led by them, which is precisely the
 * scrambled reading `sortOrder` exists to prevent.
 *
 * Courses first because that is the track somebody works through; the label
 * breaks the last tie so the list is stable rather than merely sorted.
 *
 * **One copy, used by both halves of the credentials block.** The profile page
 * draws what somebody holds and, behind the *Not earned* control, what they do
 * not — two lists over the same catalogue, on the same screen. A second
 * comparator is how they came to disagree.
 */
export function byCatalogueOrder(left: CatalogueEntry, right: CatalogueEntry) {
  return (
    Number(left.kind === "certification") - Number(right.kind === "certification") ||
    left.sortOrder - right.sortOrder ||
    left.label.localeCompare(right.label)
  );
}

/**
 * The one line a public surface prints under a credential's label.
 *
 * It reproduces what the single `source` column used to render, from the two
 * columns that replaced it — a certification says so, and a course names the
 * platform it sat on. That asymmetry is deliberate rather than an oversight:
 * for a certification the weight is the fact a reader is looking for, and
 * "Pearson VUE" is trivia about the exam centre; for a course the platform *is*
 * the weight, because "course" on its own says nothing.
 *
 * One copy, because two surfaces print it and a second copy is how the
 * credential marks drifted the first time.
 */
export function credentialSource(entry: CatalogueEntry): string {
  return entry.kind === "certification" ? "Claude Certification" : entry.platform;
}

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
   *
   * The raw `evidence_url` has no field here and no grant to `anon`, so it
   * cannot reach a browser by being carried into a prop by accident.
   */
  evidenceUrl: string | null;
};

/**
 * Bluehex's own first guess at what a visitor can buy.
 *
 * Short on purpose: every extra option splits the same people into smaller
 * buckets until no chip has anyone behind it. No "Other", which reliably
 * becomes the largest bucket and means nothing.
 *
 * **This is no longer where the directory's chips come from.** `service_catalogue`
 * is, and the roster reads it — see `ServiceOption`. The array survives as the
 * editor's vocabulary and as the list `20260820201450_catalogues.sql` seeded the
 * table from, which is what `tests/db/catalogues.test.ts` holds the two to.
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

/** `practitioner_services_cap` enforces this on the table. Written once, so the
    form that shows the cap and the trigger that enforces it cannot drift apart. */
export const maxServices = 3;

/**
 * One row of `service_catalogue` — a service Bluehex named, and therefore one
 * the roster can filter on.
 *
 * A *custom* service has no entry here by definition, which is the whole of
 * "a custom service never becomes a filter chip": it arrives as a bare label on
 * `Profile.services` and matches no option below.
 */
export type ServiceOption = {
  id: string;
  label: string;
  /** The canonical order. Alphabetical would lead with "Architecture and
      advisory" for no reason, which is what `sort()` used to do. */
  sortOrder: number;
};

/**
 * The closed vocabulary as chip options, for a surface with no query behind it.
 *
 * The prototype passes this: it draws the real roster against invented people,
 * so it has no `service_catalogue` rows to hand it and would otherwise render a
 * filter group with nothing in it. Ids are the labels because there is no row
 * to take a uuid from, and nothing resolves them — the chips match on `label`.
 */
export const vocabularyServices: ServiceOption[] = services.map((label, index) => ({
  id: label,
  label,
  sortOrder: index,
}));

/**
 * A published profile, as `anon` may read it.
 *
 * Named `Profile` rather than `Practitioner`: `CONTEXT.md` reserves
 * "practitioner" for the human and "profile" for the published record about
 * them, and the old name conflated the two. One practitioner has at most one
 * profile, so nothing else changes — but the type describes a row, and the row
 * is the profile.
 */
export type Profile = {
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
   * What they can be *hired for* — the directory's filter axis. At most three.
   * Labels rather than ids, because two kinds of row arrive here: a catalogue
   * service resolves its label through `service_catalogue`, and a custom one
   * carries its own. Both render; only the first can become a chip.
   *
   * Empty is legal and normal: a practitioner who has not said what they sell
   * appears in the directory and matches no service filter, and requiring it
   * would turn publishing a profile into declaring a commercial offering.
   */
  services: string[];
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
 * Derived, never stored — consistent with `isCertified` below, which is not
 * stored either.
 *
 * The rule: at least one credential, and every one of them verified. It used to
 * filter out the unearned first, so that a permanently unverifiable row could
 * not deny the badge forever to the people the directory exists to include.
 * There is nothing left to filter — `earned_at` is `not null`, so every
 * credential row is earned and therefore checkable — so the carve-out went with
 * the premise rather than being kept as a defensive `.filter`.
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

/**
 * `certified` — the practitioner's own assertion that they hold a Claude
 * Certification.
 *
 * Derived from the rows rather than stored, which is what stops it disagreeing
 * with them: it is "holds a credential whose catalogue entry has
 * `kind = 'certification'`", and every credential row is earned. There is no
 * `certified` column and adding one would put a boolean beside the rows it
 * summarises, free to drift.
 *
 * **It is not the badge and must never be drawn as one.** `certified` is
 * self-asserted and governs nothing; `hasVerifiedBadge` is Bluehex's check.
 * Nothing public renders this yet — the profile page prints the weight per
 * credential through `credentialSource` instead, which says the same thing
 * without summarising a person into a boolean. It lives here so the derivation
 * has one home for whatever asks next.
 */
export function isCertified(credentials: Credential[]) {
  return credentials.some((credential) => credential.entry.kind === "certification");
}

/* There is deliberately no progress helper here, and the omission is the
   presentation decision rather than an oversight. "2 of 24" reads as
   encouragement on your own editor and as eight percent to an employer, so the
   editor shows progress against the whole catalogue and the public surfaces
   show what somebody holds. Nothing public derives it, so a helper here would
   need a catalogue this module does not have and would exist only to be
   reached for. It lives with the editor, in `catalogueProgress` in
   `@/lib/profile-draft`. */

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
 * returns the first row that matches them — so a collision serves the wrong
 * profile rather than a 404. The enforcement has to be in the schema, and is
 * open on the review of #63.
 *
 * The slug is dropped rather than left empty when a name has no ASCII residue
 * — every character of "李雷" is stripped by the transliteration — because
 * `/p/-9f3c1a` leads with a bare hyphen where the readable half is meant to be.
 * `/p/9f3c1a` resolves identically and does not look broken.
 */
export function profilePath(person: Pick<Profile, "id" | "name">) {
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
 */
export function countryName(code: string) {
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
