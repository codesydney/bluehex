import { services as vocabulary, type Service } from "@/lib/practitioners";
import { emptyDraft, type BluehexControlled, type ProfileDraft } from "@/lib/profile-draft";

/**
 * Postgres rows to the editor's draft. **The pure half of the read**, split
 * from `./profile-read` the same way `@/lib/directory-mapping` is split from
 * `@/lib/directory`: the shapes below are what the query returns, and every
 * rule about nulls, ordering and identity is asserted without a stack.
 *
 * ## The two mappings that are not obvious
 *
 * **`null → ""`, in every direction the write does not go.** The draft is the
 * form's model and a control has no null: `country_code` unset is `""` in a
 * `<select>` and `null` in the column, and `@/lib/profile-draft` turns it back
 * on the way out. Both halves have to exist or a round trip through the editor
 * rewrites "not saying" as an empty string, which is a different value to
 * `where country_code is null` for the rest of that row's life.
 *
 * **A credential's `key` is its row id.** The key pairs a draft credential with
 * its entry in `BluehexControlled.verified`, and for a saved credential the
 * only identity that survives a reload is the primary key. `newCredential()`
 * mints a uuid for a row that has none yet, so the two never collide and the
 * write can tell them apart — see `./profile-plan`.
 */

/** `my_profile()`, which returns the caller's own row and nothing else. The
    domain columns arrive as `unknown` in the generated types, because a domain
    over `text` is not `text` to the type generator; they are `text` to
    Postgres and to PostgREST. */
export type ProfileRow = {
  id: string;
  handle: string;
  contact_id: string;
  name: string;
  headline: string | null;
  location: string | null;
  country_code: string | null;
  bio: string | null;
  focus: string[] | null;
  availability: string | null;
  website_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  booking_url: string | null;
  status: BluehexControlled["status"];
};

export type ContactRow = {
  contact_email: string;
  contact_phone: string | null;
  contact_note: string | null;
};

/** `my_credentials()`. `verified` is here and is never written back — it is
    Bluehex's, and it travels in `BluehexControlled` rather than in the draft so
    that nothing on the form can offer a control for it. */
export type CredentialRow = {
  id: string;
  catalogue_id: string;
  earned_at: string;
  evidence_url: string | null;
  evidence_public: boolean;
  verified: boolean;
};

/** A service row carries a catalogue reference **or** a free-text label, never
    both — `practitioner_services_one_kind`. The editor offers only the closed
    vocabulary, so a labelled row is one an admin wrote, and it is read back and
    kept rather than silently dropped. */
export type ServiceRow = {
  catalogue_id: string | null;
  label: string | null;
  service_catalogue: { label: string } | null;
};

export type OwnProfile = {
  /** The saved rows, or `null` for somebody who has never submitted. */
  profile: ProfileRow | null;
  draft: ProfileDraft;
  controlled: BluehexControlled;
};

/**
 * What the editor renders for somebody with no profile yet.
 *
 * The account address prefills the contact field, which is the spec's rule for
 * the self-service path — "self-service defaults the address to the account
 * email" — and it is a default rather than a fact: `contact_email` is where
 * work enquiries go and `auth.users.email` is a login identity, so the field
 * stays editable and the two are free to drift.
 *
 * `status` is `pending` because that is what the insert will produce, and the
 * form is told separately that nothing is saved yet — see `existing` on
 * `ProfileEditor`. A profile that does not exist has no status, and the one
 * place that difference has to be visible is the sentence about who decides.
 */
export function blankProfile(accountEmail: string | null): OwnProfile {
  return {
    profile: null,
    draft: { ...emptyDraft(), contactEmail: accountEmail ?? "" },
    controlled: { status: "pending", verified: {}, reviewNote: null },
  };
}

export function toOwnProfile({
  profile,
  contact,
  credentials,
  services,
  reviewNote,
}: {
  profile: ProfileRow;
  contact: ContactRow | null;
  credentials: CredentialRow[];
  services: ServiceRow[];
  reviewNote: string | null;
}): OwnProfile {
  /* Ordered by `earned_at` so two reads of the same profile produce the same
     form. Row order is otherwise whatever the plan happens to produce, and a
     list that reshuffles between visits looks like an edit somebody did not
     make. Newest first: the credential most likely to be corrected is the one
     just added. */
  const ordered = [...credentials].sort((a, b) => b.earned_at.localeCompare(a.earned_at));

  return {
    profile,
    draft: {
      name: profile.name,
      headline: nullToBlank(profile.headline),
      location: nullToBlank(profile.location),
      countryCode: nullToBlank(profile.country_code),
      bio: nullToBlank(profile.bio),
      focus: profile.focus ?? [],
      services: toServices(services),
      availability: nullToBlank(profile.availability),
      websiteUrl: nullToBlank(profile.website_url),
      githubUrl: nullToBlank(profile.github_url),
      linkedinUrl: nullToBlank(profile.linkedin_url),
      bookingUrl: nullToBlank(profile.booking_url),
      /* Null only if the contact read failed a policy, which cannot happen for
         a profile the caller owns: `contacts_read_own` follows the pointer.
         Blank rather than a throw, so a form still renders. */
      contactEmail: contact?.contact_email ?? "",
      contactPhone: nullToBlank(contact?.contact_phone),
      contactNote: nullToBlank(contact?.contact_note),
      credentials: ordered.map((row) => ({
        key: row.id,
        catalogueId: row.catalogue_id,
        earnedAt: row.earned_at,
        evidenceUrl: nullToBlank(row.evidence_url),
        evidencePublic: row.evidence_public,
      })),
    },
    controlled: {
      status: profile.status,
      verified: Object.fromEntries(ordered.map((row) => [row.id, row.verified])),
      reviewNote,
    },
  };
}

/**
 * Catalogue rows to the chips the form offers.
 *
 * A row whose label is outside the vocabulary is dropped from the *draft*
 * rather than kept, and this is the one place the read is lossy on purpose: the
 * form has no control that could render it, so keeping it would mean the next
 * save writes back a value nothing on screen ever showed. Dropping it is not
 * destructive either — the write only ever touches rows it can name, so an
 * admin's labelled row survives an edit it is invisible to. See
 * `planServices`.
 */
function toServices(rows: ServiceRow[]): Service[] {
  const labels = rows
    .map((row) => row.service_catalogue?.label ?? row.label)
    .filter((label): label is Service => label !== null && isService(label));

  /* Deduplicated, although `unique (practitioner_id, catalogue_id)` already
     rules the pair out — a catalogue row and a free-text row carrying the same
     word are not that pair, and two identical chips would render as one
     selected control that needs two clicks to clear. */
  return [...new Set(labels)];
}

/** The closed vocabulary is `services` in `@/lib/practitioners`, which is also
    what `20260820201450_catalogues.sql` seeded `service_catalogue` from and what
    `tests/db/catalogues.test.ts` holds the two to. Asking the list rather than
    the table is what makes the return type the union the form's chips are typed
    against; a table row that has drifted from it is exactly the row this drops. */
function isService(label: string): label is Service {
  return (vocabulary as readonly string[]).includes(label);
}

function nullToBlank(value: string | null | undefined): string {
  return value ?? "";
}
