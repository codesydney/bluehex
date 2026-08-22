import {
  maxServices,
  type CatalogueEntry,
  type Credential,
  type Profile,
  type Service,
} from "@/lib/practitioners";

/**
 * The profile editor's draft — the practitioner-writable field set, and every
 * figure derived from it.
 *
 * This is the curated-intake checklist. `scope.md` requires phase-one intake to
 * collect the full phase-two field set even where it renders only part of it,
 * because going back to twenty-five people for a field nobody asked for is a
 * fortnight of chasing humans and spends goodwill with exactly the people the
 * directory wants. The list is read off the grants in
 * `docs/spec/profile-and-credentials.md`:
 *
 *   grant insert (user_id, contact_id, name, headline, location, country_code,
 *                 bio, focus, availability,
 *                 website_url, github_url, linkedin_url, booking_url)
 *                                                on practitioners
 *   grant update (name, headline, location, country_code, bio, focus,
 *                 availability,
 *                 website_url, github_url, linkedin_url, booking_url)
 *                                                on practitioners
 *   grant insert (contact_email, contact_phone, contact_note)
 *                                                on practitioner_contacts
 *   grant insert (practitioner_id, catalogue_id, label)
 *                                                on practitioner_services
 *   grant insert (practitioner_id, catalogue_id, earned_at, evidence_url,
 *                 evidence_public)               on practitioner_credentials
 *
 * What is deliberately absent is the point: `verified`, `verified_at`,
 * `verified_by`, `status`, `approved_at`, `approved_by`, `owner_assigned_at`
 * and `owner_assigned_by` are not here, because a practitioner cannot set them.
 * `BluehexControlled` is how the editor shows the two that matter without
 * offering them.
 *
 * `source` and `label` are absent from a credential for a different reason, and
 * the two kinds of absence are worth keeping apart. They are not withheld from
 * the practitioner — they are not on the credential row at all. They belong to
 * the catalogue entry the row points at, so a credential *names* a credential
 * and can never *describe* one.
 *
 * No rendering lives here. Every rule the form enforces and every number it
 * shows is a pure function over a draft, which is what lets `pnpm test` cover
 * them without a DOM.
 */

/**
 * One credential in the draft.
 *
 * The three `""` states below are states of the *form* and never of a
 * credential. `catalogue_id` and `earned_at` are both `not null` in the column,
 * so the mapping on the way out is not `"" → null` — it is `"" → this row is
 * not submitted`. See `toWritePayload`.
 */
export type DraftCredential = {
  /** Client-side only, for React keys and for pairing with verification state. */
  key: string;
  /** `catalogue_id`. `""` while nothing is picked — a `<select>` has no null. */
  catalogueId: string;
  /** `earned_at date`, `not null` in the column. `""` while the field is empty. */
  earnedAt: string;
  /** `evidence_url`, an `https_url` domain. `""` here, null in the column. */
  evidenceUrl: string;
  /**
   * `evidence_public boolean not null default false`. Private by default, and
   * the practitioner's call: publishing a Skilljar page exposes their full
   * legal name permanently, but early on a clickable certificate is worth more
   * to an employer than the word "Verified". Collected alongside the URL rather
   * than as a separate later step, because the second ask is the one that does
   * not get answered.
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
   * must not travel — `""` and `null` are different values to
   * `where country_code = ...`, only one of them can mean "not saying", and a
   * table holding both filters wrongly for the rest of its life.
   */
  countryCode: string;
  bio: string;
  /** What they know. Free text, and no longer what the directory filters on. */
  focus: string[];
  /**
   * What they can be hired for, and the axis the directory filters on. At most
   * `maxServices`, from the closed set in `@/lib/practitioners` — capped
   * because a multi-select everyone maxes out is a filter that narrows nothing.
   * The form shows the cap before it binds and the database enforces it again
   * with `practitioner_services_cap`, because a cap enforced only in a form is
   * not a cap.
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

export type ProfileStatus = BluehexControlled["status"];

/**
 * What each status means, in the two places the editor says it.
 *
 * One map rather than two, because they are the same axis read for different
 * purposes and two of them drift: `axis` names the state on the Review step,
 * where the subject is the decision itself, and `row` says what it means for
 * the directory, which is the only thing the preview is drawing. Both have to
 * cover all four — a ternary that maps `approved` and calls everything else
 * "waiting on Bluehex" is true of `pending` and false of the other two, and
 * misstating a Bluehex-owned axis is misstating what this editor exists to
 * explain.
 */
export const statusCopy: Record<ProfileStatus, { axis: string; row: string }> = {
  pending: {
    axis: "Waiting for Bluehex to read it",
    row: "Not in the directory yet — waiting on Bluehex.",
  },
  approved: {
    axis: "Approved — in the directory",
    row: "Live in the directory.",
  },
  rejected: {
    axis: "Not approved",
    row: "Not in the directory — Bluehex did not approve it.",
  },
  withdrawn: {
    axis: "Withdrawn",
    row: "Not in the directory — this profile has been withdrawn.",
  },
};

/**
 * A short country list rather than the full ISO set. `Intl` exposes region
 * *names* but no list of region codes to enumerate, so anything exhaustive
 * needs a data file of its own. This covers the community's actual spread; the
 * column takes any ISO 3166-1 alpha-2 value and the check constraint
 * deliberately names no list, so growing this is an edit here and nowhere else.
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
] as const;

/** Suggested focus areas. Free text underneath — `focus` is a `text[]`. */
export const focusSuggestions: readonly string[] = [
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

/**
 * A new, empty credential row.
 *
 * `crypto.randomUUID()` rather than `Math.random()`, and it is only ever called
 * from an event handler. Generating a key during render would produce a
 * different value on the server and on the client and fail hydration.
 */
export function newCredential(key = crypto.randomUUID()): DraftCredential {
  return { key, catalogueId: "", earnedAt: "", evidenceUrl: "", evidencePublic: false };
}

/** A draft with nothing in it — what a practitioner with no profile starts from. */
export function emptyDraft(): ProfileDraft {
  return {
    name: "",
    headline: "",
    location: "",
    countryCode: "",
    bio: "",
    focus: [],
    services: [],
    availability: "",
    websiteUrl: "",
    githubUrl: "",
    linkedinUrl: "",
    bookingUrl: "",
    contactEmail: "",
    contactPhone: "",
    contactNote: "",
    credentials: [],
  };
}

/**
 * Whether an edit to a credential invalidates the check of it — the three
 * columns `credentials_guard()` clears `verified` on, in the spec's own order:
 * `catalogue_id`, `earned_at`, `evidence_url`.
 *
 * `evidencePublic` is deliberately absent, exactly as it is from the trigger:
 * it changes the claim's *visibility*, not the claim. That exemption is the one
 * a practitioner most needs to hear, because the opt-in is the toggle that
 * should be easy to say yes to and "this costs you your badge" is a reason to
 * leave it off — which is the opposite of what the opt-in is for.
 *
 * This is the only place the list is written down on this side of the wire. The
 * trigger is the enforcement; this is what lets the preview show the rule as it
 * happens rather than assert it in a sentence.
 */
export function claimEdited(before: DraftCredential, after: DraftCredential): boolean {
  return (
    before.catalogueId !== after.catalogueId ||
    before.earnedAt !== after.earnedAt ||
    before.evidenceUrl !== after.evidenceUrl
  );
}

/**
 * Picking a service, with the cap applied.
 *
 * The cap lives here rather than in the picker's click handler so that the rule
 * can be tested without a DOM, and so the control and the rule cannot drift:
 * the picker disables what this would refuse, and disabling is the *showing* of
 * a cap rather than the cap itself.
 *
 * Unpicking is always allowed, including at the cap — a full picker that also
 * refuses to empty a slot is a trap, and it is the state somebody is in exactly
 * when they want to change their mind.
 */
export function toggleService(value: Service[], service: Service): Service[] {
  if (value.includes(service)) return value.filter((item) => item !== service);
  if (value.length >= maxServices) return value;

  return [...value, service];
}

/** Whether picking anything else would exceed the cap. */
export function servicesFull(value: Service[]): boolean {
  return value.length >= maxServices;
}

/**
 * `credentials_guard()`, mocked: an edit to what a credential claims clears the
 * check of it.
 *
 * The trigger is the enforcement and this is what lets the preview *show* the
 * rule as it happens rather than assert it in a sentence three steps away. It
 * compares two drafts rather than watching a field, because the rule is about
 * columns rather than about controls — and it returns the same object when
 * nothing was invalidated, so an ordinary keystroke does not replace state
 * React would then have to reconcile.
 *
 * Only `verified` is cleared. Nothing here sets it, and nothing anywhere in the
 * application may: `verified` is granted to `bluehex_admin` alone, and the
 * trigger holds even if a later migration re-grants the column by accident.
 */
export function clearInvalidatedChecks(
  before: ProfileDraft,
  after: ProfileDraft,
  controlled: BluehexControlled,
): BluehexControlled {
  const invalidated = after.credentials.filter((credential) => {
    const previous = before.credentials.find((item) => item.key === credential.key);
    return previous !== undefined && claimEdited(previous, credential);
  });

  if (invalidated.length === 0) return controlled;

  return {
    ...controlled,
    verified: {
      ...controlled.verified,
      ...Object.fromEntries(invalidated.map((credential) => [credential.key, false])),
    },
  };
}

/**
 * Whether this row is a credential at all, rather than a state of the form.
 *
 * `catalogue_id` and `earned_at` are both `not null`, so a row missing either
 * is not a row the database would take — which is why the mapping on the way
 * out is `"" → do not submit this row` rather than `"" → null`.
 *
 * **Every surface that counts, draws or submits a credential goes through
 * here**, and that is the whole point of it being one function. Testing only
 * `catalogue_id` was enough to make the progress figure, the "Submitting N
 * credentials" line and the preview each describe a set the write path would
 * not carry — a practitioner told Bluehex was about to receive three when it
 * would receive two, on the step whose entire job is saying who owes what.
 */
export function isCompleteCredential(credential: DraftCredential): boolean {
  return credential.catalogueId !== "" && credential.earnedAt !== "";
}

/**
 * The draft rows that are credentials.
 *
 * Every figure derived from the credential list goes through here: letting an
 * incomplete row move a number is how the progress panel and the checklist
 * inside it came to disagree — same box, same click, two answers.
 */
export function claimedCredentials(draft: ProfileDraft): DraftCredential[] {
  return draft.credentials.filter(isCompleteCredential);
}

/**
 * The badge rollup, as the spec states it: at least one credential, and every
 * one of them verified. Shown read-only, so a practitioner can see why they do
 * or do not have a badge without being handed anything that would change it.
 *
 * Three counts rather than two, and the third is the point. "Waiting on
 * Bluehex" over a credential with no certificate link names the wrong party:
 * nobody at Bluehex can move it and the practitioner can, with one field. It is
 * the only thing on the whole form they can act on to get their badge.
 */
export function badgeState(draft: ProfileDraft, controlled: BluehexControlled) {
  const claimed = claimedCredentials(draft);
  const held = claimed.length;
  const verified = claimed.filter((credential) => controlled.verified[credential.key]).length;
  const awaitingCheck = claimed.filter(
    (credential) => !controlled.verified[credential.key] && credential.evidenceUrl !== "",
  ).length;

  return {
    shows: held > 0 && verified === held,
    held,
    verified,
    awaitingCheck,
    awaitingProof: held - verified - awaitingCheck,
  };
}

/**
 * Progress: how much of the catalogue this profile holds.
 *
 * Derived by comparing two sets, which is what replaced the in-progress
 * credential. Nobody asserts anything to make this number move — the catalogue
 * is Bluehex's, the holdings are checked, and "not yet" is the absence of a row
 * rather than a claim wearing the same shape as a verified one.
 *
 * **The editor and nowhere else.** "2 of 24" reads as encouragement to its
 * owner and as eight percent to an employer, so the public surfaces show what
 * somebody holds and never what they lack. Same number, different reader,
 * opposite effect.
 *
 * The denominator counts claimable entries only: a retired entry is not offered
 * to anybody, so counting it would make a full catalogue unreachable.
 */
export function catalogueProgress(draft: ProfileDraft, catalogue: CatalogueEntry[]) {
  return { held: claimedCredentials(draft).length, total: pickableEntries(catalogue).length };
}

/**
 * What the picker offers, in track order.
 *
 * `active` filters here rather than in a policy: a retired entry stays readable
 * so a profile holding it still renders its label, and the picker is a query
 * rather than a visibility rule. It is also the denominator of the progress
 * figure — counting an entry nobody can claim would put a full catalogue out of
 * reach.
 */
export function pickableEntries(catalogue: CatalogueEntry[]): CatalogueEntry[] {
  return catalogue
    .filter((entry) => entry.active)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * The id the preview's `Profile` carries.
 *
 * A draft has no row and therefore no id, and `Profile.id` is not
 * optional. The preview never links anywhere — `profilePath()` is not called on
 * it — so a sentinel is honest where a fabricated uuid would look resolvable.
 */
const PREVIEW_ID = "preview";

/**
 * The draft as the public record — the mapping the preview draws.
 *
 * **This is the mechanism, not a decoration.** The return type is
 * `Profile`, which is the shape `anon` is granted and nothing else: it has
 * no `contactEmail`, no `contactPhone` and no `contactNote`, so typing an
 * address into the Contact step *cannot* move the preview. That guarantee is
 * structural rather than remembered, and `profile-draft.test.ts` asserts it.
 *
 * Two more rules fall out of the same mapping rather than being applied to it:
 *
 *   - An evidence URL reaches `Credential.evidenceUrl` only when its opt-in is
 *     on, mirroring the generated `evidence_url_public` column that `anon` is
 *     granted in place of `evidence_url`.
 *   - Custom services do not exist here, because `Profile.services` is the
 *     closed set the roster filters on. The editor collects that set only; see
 *     the note in `profile-editor.tsx`.
 *
 * Rows with nothing picked are dropped, and so are rows naming an entry that is
 * not in the catalogue — `catalogue_id` is a `not null` foreign key with
 * `on delete restrict`, so a credential pointing at nothing is a state the
 * database refuses and the preview should not invent.
 */
export function previewPractitioner(
  draft: ProfileDraft,
  controlled: BluehexControlled,
  catalogue: CatalogueEntry[],
): Profile {
  const credentials: Credential[] = [];

  for (const credential of draft.credentials) {
    /* The same predicate the write path uses. Without it the preview draws a
       claim that `validateDraft` blocks and `toWritePayload` drops — a state
       unreachable in the directory, on the one component whose argument is
       that it shows the truth rather than asserting it. */
    if (!isCompleteCredential(credential)) continue;

    const entry = catalogue.find((item) => item.id === credential.catalogueId);
    if (!entry) continue;

    credentials.push({
      entry,
      earnedAt: credential.earnedAt,
      verified: Boolean(controlled.verified[credential.key]),
      evidenceUrl:
        credential.evidencePublic && credential.evidenceUrl !== ""
          ? credential.evidenceUrl
          : null,
    });
  }

  return {
    id: PREVIEW_ID,
    name: draft.name,
    headline: blankToNull(draft.headline),
    location: blankToNull(draft.location),
    countryCode: blankToNull(draft.countryCode),
    bio: blankToNull(draft.bio),
    focus: draft.focus,
    services: draft.services.slice(0, maxServices),
    availability: blankToNull(draft.availability),
    websiteUrl: blankToNull(draft.websiteUrl),
    githubUrl: blankToNull(draft.githubUrl),
    linkedinUrl: blankToNull(draft.linkedinUrl),
    bookingUrl: blankToNull(draft.bookingUrl),
    credentials,
  };
}

/**
 * What a write would carry — snake_case, one object per table, and the shape
 * #14 hands to Supabase.
 *
 * It exists now, unused by any request, because the two mappings in it are
 * where a form quietly disagrees with a schema and both were found the hard way
 * on #73:
 *
 *   - **`"" → null` for every optional column.** `evidence_url` and the four
 *     link columns are `public.https_url`, a domain whose check refuses `''`.
 *     An untouched optional URL field submitted as `""` is a 400 naming
 *     `https_url`, which is not a message anyone should see.
 *   - **`"" → drop the row` for a credential.** `catalogue_id` and `earned_at`
 *     are `not null`, so an incomplete credential is not a row the database
 *     would take. It is draft state, and it never travels. The failing version
 *     type-checks, because `""` is a `string` and only Postgres refuses it.
 *
 * `services` carries labels rather than `service_catalogue` ids: resolving a
 * label to its catalogue row is a query, and this function does not have one.
 * #14 resolves them where it writes.
 */
export type ProfileWrite = {
  profile: {
    name: string;
    headline: string | null;
    location: string | null;
    country_code: string | null;
    bio: string | null;
    focus: string[];
    availability: string | null;
    website_url: string | null;
    github_url: string | null;
    linkedin_url: string | null;
    booking_url: string | null;
  };
  contact: {
    contact_email: string;
    contact_phone: string | null;
    contact_note: string | null;
  };
  services: Service[];
  credentials: {
    catalogue_id: string;
    earned_at: string;
    evidence_url: string | null;
    evidence_public: boolean;
  }[];
};

export function toWritePayload(draft: ProfileDraft): ProfileWrite {
  return {
    profile: {
      name: draft.name.trim(),
      headline: blankToNull(draft.headline),
      location: blankToNull(draft.location),
      country_code: blankToNull(draft.countryCode),
      bio: blankToNull(draft.bio),
      focus: draft.focus,
      availability: blankToNull(draft.availability),
      website_url: blankToNull(draft.websiteUrl),
      github_url: blankToNull(draft.githubUrl),
      linkedin_url: blankToNull(draft.linkedinUrl),
      booking_url: blankToNull(draft.bookingUrl),
    },
    contact: {
      contact_email: draft.contactEmail.trim(),
      contact_phone: blankToNull(draft.contactPhone),
      contact_note: blankToNull(draft.contactNote),
    },
    services: draft.services,
    credentials: draft.credentials
      .filter(isCompleteCredential)
      .map((credential) => ({
        catalogue_id: credential.catalogueId,
        earned_at: credential.earnedAt,
        evidence_url: blankToNull(credential.evidenceUrl),
        evidence_public: credential.evidencePublic,
      })),
  };
}

/**
 * `""` — and anything that is only whitespace — is null.
 *
 * Trimmed rather than passed through, because a field holding a single space is
 * "not saying" wearing a value's clothes, and it is a value to
 * `where country_code is null`.
 */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
