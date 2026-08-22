import { describe, expect, it } from "vitest";

import { emptyDraft } from "@/lib/profile-draft";
import {
  blankProfile,
  toOwnProfile,
  type ContactRow,
  type CredentialRow,
  type ProfileRow,
  type ServiceRow,
} from "./profile-mapping";

/**
 * The rows-to-draft half of the editor's read, asserted without a stack.
 *
 * `profile-read.ts` names the columns and makes the requests; every rule about
 * what an absent value becomes, what order things come back in and what a
 * credential's identity is lives here. Same split, and for the same reason, as
 * `@/lib/directory` against `@/lib/directory-mapping`.
 */

function profileRow(over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "p1",
    handle: "abcd1234",
    contact_id: "c1",
    name: "Mara Ellison",
    headline: null,
    location: null,
    country_code: null,
    bio: null,
    focus: null,
    availability: null,
    website_url: null,
    github_url: null,
    linkedin_url: null,
    booking_url: null,
    status: "pending",
    ...over,
  };
}

const contact: ContactRow = {
  contact_email: "mara@example.invalid",
  contact_phone: null,
  contact_note: null,
};

function credential(over: Partial<CredentialRow> = {}): CredentialRow {
  return {
    id: "cr1",
    catalogue_id: "cat1",
    earned_at: "2026-01-22",
    evidence_url: null,
    evidence_public: false,
    verified: false,
    ...over,
  };
}

function read(over: Partial<Parameters<typeof toOwnProfile>[0]> = {}) {
  return toOwnProfile({
    profile: profileRow(),
    contact,
    credentials: [],
    services: [],
    reviewNote: null,
    ...over,
  });
}

describe("blankProfile", () => {
  it("prefills the contact address and nothing else", () => {
    const own = blankProfile("mara@example.invalid");

    expect(own.profile).toBeNull();
    expect(own.draft).toEqual({ ...emptyDraft(), contactEmail: "mara@example.invalid" });
  });

  /* An account with no address on it is not a state anything mints — magic link
     is the only provider and the address is the identity — but `Viewer.email` is
     nullable, and a form is not the place to find out. */
  it("leaves the address blank when the account has none", () => {
    expect(blankProfile(null).draft).toEqual(emptyDraft());
  });

  it("is pending, unverified and unnoted", () => {
    expect(blankProfile(null).controlled).toEqual({
      status: "pending",
      verified: {},
      reviewNote: null,
    });
  });
});

describe("toOwnProfile", () => {
  /* The mapping the write reverses. `""` is what a control holds for "not
     saying" and `null` is what the column holds; a round trip that turned one
     into the other would leave a table filtering wrongly for the rest of its
     life — see `toWritePayload`, which is the other half. */
  it("reads every absent column back as an empty control", () => {
    const { draft } = read();

    expect(draft.headline).toBe("");
    expect(draft.countryCode).toBe("");
    expect(draft.bio).toBe("");
    expect(draft.availability).toBe("");
    expect(draft.websiteUrl).toBe("");
    expect(draft.contactPhone).toBe("");
    expect(draft.focus).toEqual([]);
  });

  it("carries the values that are there", () => {
    const { draft } = read({
      profile: profileRow({
        headline: "Staff engineer, agent platforms",
        country_code: "AU",
        focus: ["Agents", "Evals"],
        website_url: "https://example.invalid/mara",
      }),
      contact: { ...contact, contact_note: "Weekday mornings." },
    });

    expect(draft.headline).toBe("Staff engineer, agent platforms");
    expect(draft.countryCode).toBe("AU");
    expect(draft.focus).toEqual(["Agents", "Evals"]);
    expect(draft.websiteUrl).toBe("https://example.invalid/mara");
    expect(draft.contactNote).toBe("Weekday mornings.");
  });

  /* The key pairs a draft credential with its entry in `controlled.verified`,
     and for a saved row the only identity that survives a reload is the primary
     key. Getting this wrong shows a check against the wrong credential, which is
     the one thing on this form that is Bluehex's word rather than the
     practitioner's. */
  it("keys a credential on its row id, and its check with it", () => {
    const { draft, controlled } = read({
      credentials: [
        credential({ id: "cr1", verified: true }),
        credential({ id: "cr2", catalogue_id: "cat2", earned_at: "2026-06-04" }),
      ],
    });

    expect(draft.credentials.map((row) => row.key)).toEqual(["cr2", "cr1"]);
    expect(controlled.verified).toEqual({ cr1: true, cr2: false });
  });

  it("orders credentials newest first", () => {
    const { draft } = read({
      credentials: [
        credential({ id: "old", earned_at: "2025-03-01" }),
        credential({ id: "new", catalogue_id: "cat2", earned_at: "2026-06-04" }),
        credential({ id: "mid", catalogue_id: "cat3", earned_at: "2026-01-22" }),
      ],
    });

    expect(draft.credentials.map((row) => row.key)).toEqual(["new", "mid", "old"]);
  });

  /* `verified` is Bluehex's and travels in `controlled`, never in the draft.
     There is no field on `DraftCredential` for it to land in, and this asserts
     that the read does not invent one by another name. */
  it("keeps the raw evidence link in the draft and the check out of it", () => {
    const { draft } = read({
      credentials: [
        credential({ evidence_url: "https://example.invalid/cert", evidence_public: true, verified: true }),
      ],
    });

    expect(draft.credentials[0]).toEqual({
      key: "cr1",
      catalogueId: "cat1",
      earnedAt: "2026-01-22",
      evidenceUrl: "https://example.invalid/cert",
      evidencePublic: true,
    });
  });

  describe("services", () => {
    function serviceRow(over: Partial<ServiceRow> = {}): ServiceRow {
      return { catalogue_id: "s1", label: null, service_catalogue: { label: "Code review" }, ...over };
    }

    it("reads a catalogue row as its chip", () => {
      expect(read({ services: [serviceRow()] }).draft.services).toEqual(["Code review"]);
    });

    /* A free-text row is an admin's, written during curated intake, and the form
       has no control that could render it. It is dropped from the draft and left
       alone by the write — see `planServices`, which is what makes dropping it
       non-destructive rather than a deletion one save later. */
    it("drops a label outside the closed vocabulary", () => {
      const rows = [
        serviceRow(),
        serviceRow({ catalogue_id: null, label: "Fractional CTO", service_catalogue: null }),
      ];

      expect(read({ services: rows }).draft.services).toEqual(["Code review"]);
    });

    it("does not render one service as two chips", () => {
      const rows = [serviceRow(), serviceRow({ catalogue_id: "s2" })];

      expect(read({ services: rows }).draft.services).toEqual(["Code review"]);
    });
  });

  it("carries the status and the review note through untouched", () => {
    const { controlled } = read({
      profile: profileRow({ status: "rejected" }),
      reviewNote: "The certificate link 404s.",
    });

    expect(controlled.status).toBe("rejected");
    expect(controlled.reviewNote).toBe("The certificate link 404s.");
  });
});
