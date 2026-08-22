import { describe, expect, it } from "vitest";

import { credentialSource, hasVerifiedBadge, maxServices } from "@/lib/practitioners";
import {
  badgeState,
  catalogueProgress,
  claimEdited,
  clearInvalidatedChecks,
  emptyDraft,
  newCredential,
  pickableEntries,
  isCompleteCredential,
  previewPractitioner,
  servicesFull,
  statusCopy,
  toggleService,
  toWritePayload,
  type BluehexControlled,
  type DraftCredential,
  type ProfileDraft,
} from "@/lib/profile-draft";
import { credentialCatalogue } from "@/lib/profile-fixtures";

/**
 * The editor's rules, tested where they live.
 *
 * Every rule the form enforces is a pure function over a draft rather than
 * something a component does on a click, which is what makes this file
 * possible: `pnpm test` has no DOM, no React Testing Library and no browser,
 * and the rules that matter here are not about rendering. What a component
 * still owns is showing them — the disabled option, the message beside the
 * field — and the seam is drawn so that the showing cannot disagree with the
 * rule.
 */

const catalogue = pickableEntries(credentialCatalogue());
const [first, second, third] = catalogue;

function credential(overrides: Partial<DraftCredential> = {}): DraftCredential {
  return {
    key: "k1",
    catalogueId: first.id,
    earnedAt: "2026-01-22",
    evidenceUrl: "https://example.invalid/certificate",
    evidencePublic: false,
    ...overrides,
  };
}

function draftWith(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return { ...emptyDraft(), name: "Mara Ellison", contactEmail: "mara@example.invalid", ...overrides };
}

const nothingChecked: BluehexControlled = { status: "pending", verified: {}, reviewNote: null };

/** The badge as the preview would draw it — the path `RowPreview` itself takes. */
function badgeInPreview(draft: ProfileDraft, controlled: BluehexControlled): boolean {
  return hasVerifiedBadge(previewPractitioner(draft, controlled, catalogue).credentials);
}

/** A credential picked but not dated: complete enough to resolve, not to submit. */
function dateless(key: string, catalogueId: string): DraftCredential {
  return credential({ key, catalogueId, earnedAt: "" });
}

describe("the catalogue the editor picks from", () => {
  it("is the real record, not an invented one", () => {
    /* The 24 confirmed Claude credentials in `supabase/seed/credential-catalogue.json`,
       which is the canonical list `supabase/seed.sql` loads. A fixture inventing course
       names would put plausible fiction behind the badge. */
    expect(catalogue).toHaveLength(24);
    expect(catalogue.map((entry) => entry.label)).toContain("Claude 101");
  });

  it("groups certifications apart from courses, in track order", () => {
    /* `credentialSource` is what the `<optgroup>` labels are, and what the
       public surfaces print — asserting on it rather than on `kind` is what
       keeps the picker and the profile page describing an entry the same way. */
    const sources = catalogue.map(credentialSource);

    expect(new Set(sources)).toEqual(new Set(["Anthropic Academy", "Claude Certification"]));
    /* Every Academy entry before every certification, so `<optgroup>` can be
       derived from the sort order rather than from a second list. */
    expect(sources.lastIndexOf("Anthropic Academy")).toBeLessThan(
      sources.indexOf("Claude Certification"),
    );
  });

  it("carries the two axes #103 split apart, rather than one string", () => {
    const certifications = catalogue.filter((entry) => entry.kind === "certification");

    expect(certifications).toHaveLength(4);
    /* The disagreement is the split working: the exam is delivered by Pearson
       VUE and its page lives on a partner Skilljar tenant. A single `source`
       column could not hold both facts. */
    expect(certifications.every((entry) => entry.platform === "Pearson VUE")).toBe(true);
    expect(
      certifications.every((entry) => entry.courseUrl?.startsWith("https://anthropic-partners.")),
    ).toBe(true);
  });

  it("offers nothing retired", () => {
    expect(pickableEntries([...credentialCatalogue(), { ...first, id: "retired", active: false }])).
      not.toContainEqual(expect.objectContaining({ id: "retired" }));
  });
});

describe("editing a credential's claim", () => {
  /* `credentials_guard()` clears `verified` on a change to `catalogue_id`,
     `earned_at` or `evidence_url` — and deliberately not on `evidence_public`. */

  it("counts a change to which credential, when, or the proof", () => {
    const before = credential();

    expect(claimEdited(before, { ...before, catalogueId: second.id })).toBe(true);
    expect(claimEdited(before, { ...before, earnedAt: "2026-02-01" })).toBe(true);
    expect(claimEdited(before, { ...before, evidenceUrl: "https://example.invalid/other" })).toBe(
      true,
    );
  });

  it("does not count the publish opt-in, which changes visibility and not the claim", () => {
    const before = credential({ evidencePublic: false });

    expect(claimEdited(before, { ...before, evidencePublic: true })).toBe(false);
  });

  it("does not count an untouched row", () => {
    expect(claimEdited(credential(), credential())).toBe(false);
  });

  it("clears the check of the credential that changed, and only that one", () => {
    const before = draftWith({
      credentials: [credential({ key: "a" }), credential({ key: "b", catalogueId: second.id })],
    });
    const after = {
      ...before,
      credentials: [before.credentials[0], { ...before.credentials[1], earnedAt: "2026-03-03" }],
    };
    const controlled: BluehexControlled = {
      status: "approved",
      verified: { a: true, b: true },
      reviewNote: null,
    };

    expect(clearInvalidatedChecks(before, after, controlled).verified).toEqual({
      a: true,
      b: false,
    });
  });

  it("leaves the check alone when only the publish opt-in moved", () => {
    const before = draftWith({ credentials: [credential({ key: "a" })] });
    const after = {
      ...before,
      credentials: [{ ...before.credentials[0], evidencePublic: true }],
    };
    const controlled: BluehexControlled = {
      status: "pending",
      verified: { a: true },
      reviewNote: null,
    };

    /* Identity, not just equality: an ordinary keystroke must not replace state. */
    expect(clearInvalidatedChecks(before, after, controlled)).toBe(controlled);
  });

  it("shows in the preview, which is where a practitioner meets the rule", () => {
    const before = draftWith({ credentials: [credential({ key: "a" })] });
    const controlled: BluehexControlled = {
      status: "pending",
      verified: { a: true },
      reviewNote: null,
    };

    expect(badgeInPreview(before, controlled)).toBe(true);

    const after = {
      ...before,
      credentials: [{ ...before.credentials[0], catalogueId: second.id }],
    };

    expect(badgeInPreview(after, clearInvalidatedChecks(before, after, controlled))).toBe(false);
  });
});

describe("a row that is not yet a credential", () => {
  /* `catalogue_id` and `earned_at` are both `not null`. A row missing either is
     a state of the form, and the bug this covers was that only `catalogue_id`
     was tested — so the counters and the preview each described a set the write
     path would not carry. */

  it("is not one until it has both a credential and a date", () => {
    expect(isCompleteCredential(credential())).toBe(true);
    expect(isCompleteCredential(newCredential("blank"))).toBe(false);
    expect(isCompleteCredential(dateless("d", first.id))).toBe(false);
    expect(isCompleteCredential(credential({ catalogueId: "" }))).toBe(false);
  });

  it("does not move the figure the practitioner is shown", () => {
    const draft = draftWith({ credentials: [credential(), dateless("d", second.id)] });

    expect(catalogueProgress(draft, catalogue).held).toBe(1);
    expect(badgeState(draft, nothingChecked).held).toBe(1);
  });

  it("does not name Bluehex as the party being waited on", () => {
    /* With an evidence URL and no date it used to count as "waiting on
       Bluehex", which nobody at Bluehex can move. */
    const draft = draftWith({ credentials: [dateless("d", first.id)] });

    expect(badgeState(draft, nothingChecked)).toMatchObject({
      held: 0,
      awaitingCheck: 0,
      awaitingProof: 0,
    });
  });

  it("is not drawn in the preview, because it can never be published", () => {
    const draft = draftWith({ credentials: [credential(), dateless("d", second.id)] });

    expect(previewPractitioner(draft, nothingChecked, catalogue).credentials).toHaveLength(1);
  });

  it("is counted, drawn and submitted by one predicate, so the three agree", () => {
    const draft = draftWith({
      credentials: [credential(), dateless("d", second.id), newCredential("blank")],
    });

    expect(badgeState(draft, nothingChecked).held).toBe(1);
    expect(previewPractitioner(draft, nothingChecked, catalogue).credentials).toHaveLength(1);
    expect(toWritePayload(draft).credentials).toHaveLength(1);
  });
});

describe("the preview", () => {
  it("cannot move when a contact detail is typed", () => {
    /* The demonstration the Contact step exists for, and the reason it is
       structural rather than remembered: `previewPractitioner` returns a
       `Practitioner`, which is the shape `anon` is granted — there is no
       contact field on it to draw even by accident. */
    const before = draftWith({ credentials: [credential()] });
    const after = {
      ...before,
      contactEmail: "someone-else@example.invalid",
      contactPhone: "+61 400 000 000",
      contactNote: "Mornings are best.",
    };

    expect(previewPractitioner(after, nothingChecked, catalogue)).toEqual(
      previewPractitioner(before, nothingChecked, catalogue),
    );
  });

  it("withholds a certificate link until its opt-in is on", () => {
    const off = draftWith({ credentials: [credential({ evidencePublic: false })] });
    const on = draftWith({ credentials: [credential({ evidencePublic: true })] });

    expect(previewPractitioner(off, nothingChecked, catalogue).credentials[0].evidenceUrl).toBeNull();
    expect(previewPractitioner(on, nothingChecked, catalogue).credentials[0].evidenceUrl).toBe(
      "https://example.invalid/certificate",
    );
  });

  it("publishes nothing for an opt-in with no link behind it", () => {
    const draft = draftWith({
      credentials: [credential({ evidenceUrl: "", evidencePublic: true })],
    });

    expect(previewPractitioner(draft, nothingChecked, catalogue).credentials[0].evidenceUrl).toBeNull();
  });

  it("draws no row for a credential nothing has been picked for", () => {
    const draft = draftWith({ credentials: [newCredential("blank")] });

    expect(previewPractitioner(draft, nothingChecked, catalogue).credentials).toEqual([]);
  });

  it("turns an unset optional field into null rather than an empty string", () => {
    const person = previewPractitioner(draftWith(), nothingChecked, catalogue);

    expect(person.headline).toBeNull();
    expect(person.countryCode).toBeNull();
    expect(person.bookingUrl).toBeNull();
  });
});

describe("the badge rollup", () => {
  it("shows only when every credential has been checked", () => {
    const draft = draftWith({
      credentials: [credential({ key: "a" }), credential({ key: "b", catalogueId: second.id })],
    });

    expect(
      badgeState(draft, { status: "pending", verified: { a: true }, reviewNote: null }).shows,
    ).toBe(false);
    expect(
      badgeState(draft, { status: "pending", verified: { a: true, b: true }, reviewNote: null })
        .shows,
    ).toBe(true);
  });

  it("never shows for a profile with no credentials", () => {
    expect(badgeState(draftWith(), nothingChecked).shows).toBe(false);
  });

  it("names who is waited on: Bluehex has proof, or the practitioner has not sent it", () => {
    const draft = draftWith({
      credentials: [
        credential({ key: "checked" }),
        credential({ key: "waiting", catalogueId: second.id }),
        credential({ key: "unproven", catalogueId: third.id, evidenceUrl: "" }),
      ],
    });

    expect(badgeState(draft, { status: "pending", verified: { checked: true }, reviewNote: null }))
      .toMatchObject({ held: 3, verified: 1, awaitingCheck: 1, awaitingProof: 1 });
  });

  it("does not count a row that could not be submitted", () => {
    const draft = draftWith({ credentials: [credential(), newCredential("blank")] });

    expect(badgeState(draft, nothingChecked).held).toBe(1);
  });
});

describe("progress against the catalogue", () => {
  it("counts what is held against what can be claimed", () => {
    const draft = draftWith({ credentials: [credential()] });

    expect(catalogueProgress(draft, catalogue)).toEqual({ held: 1, total: 24 });
  });

  it("agrees with the checklist beneath it — an empty row moves nothing", () => {
    const draft = draftWith({ credentials: [credential(), newCredential("blank")] });

    expect(catalogueProgress(draft, catalogue).held).toBe(1);
  });
});

describe("what the practitioner is told about status", () => {
  it("covers all four, so none of them is described as another", () => {
    for (const status of ["pending", "approved", "rejected", "withdrawn"] as const) {
      expect(statusCopy[status].axis).toBeTruthy();
      expect(statusCopy[status].row).toBeTruthy();
    }
  });

  it("does not tell a rejected or withdrawn profile it is waiting on Bluehex", () => {
    expect(statusCopy.pending.row).toContain("waiting on Bluehex");
    expect(statusCopy.rejected.row).not.toContain("waiting on Bluehex");
    expect(statusCopy.withdrawn.row).not.toContain("waiting on Bluehex");
  });

  it("says only approved is in the directory", () => {
    expect(statusCopy.approved.row).not.toContain("Not in the directory");
    for (const status of ["pending", "rejected", "withdrawn"] as const) {
      expect(statusCopy[status].row).toContain("Not in the directory");
    }
  });
});

describe("the services cap", () => {
  it("stops at three", () => {
    expect(maxServices).toBe(3);

    let picked = toggleService([], "Code review");
    picked = toggleService(picked, "Implementation");
    picked = toggleService(picked, "Team training");

    expect(servicesFull(picked)).toBe(true);

    const refused = toggleService(picked, "One-to-one tutoring");

    expect(refused).toEqual(picked);
  });

  it("lets you unpick at the cap, which is when you most want to", () => {
    const picked = toggleService(
      toggleService(toggleService([], "Code review"), "Implementation"),
      "Team training",
    );

    expect(toggleService(picked, "Implementation")).toEqual(["Code review", "Team training"]);
  });

  it("cannot produce a duplicate", () => {
    expect(toggleService(["Code review"], "Code review")).toEqual([]);
  });
});

describe("what a write would carry", () => {
  it("sends null rather than an empty string for every optional column", () => {
    /* `evidence_url` and the four link columns are `public.https_url`, a domain
       whose check refuses `''`. An untouched optional field sent as `""` is a
       400 naming `https_url`, which is not a message anyone should read. */
    const payload = toWritePayload(
      draftWith({ credentials: [credential({ evidenceUrl: "" })] }),
    );

    expect(payload.profile).toMatchObject({
      headline: null,
      location: null,
      country_code: null,
      bio: null,
      availability: null,
      website_url: null,
      github_url: null,
      linkedin_url: null,
      booking_url: null,
    });
    expect(payload.contact).toMatchObject({ contact_phone: null, contact_note: null });
    expect(payload.credentials[0].evidence_url).toBeNull();
  });

  it("treats a field holding only whitespace as unset", () => {
    expect(toWritePayload(draftWith({ headline: "   " })).profile.headline).toBeNull();
  });

  it("does not submit a credential that is not one", () => {
    /* `catalogue_id` and `earned_at` are both `not null`, so an incomplete row
       is draft state and never travels. */
    const draft = draftWith({
      credentials: [
        credential({ key: "whole" }),
        newCredential("nothing-picked"),
        credential({ key: "no-date", catalogueId: second.id, earnedAt: "" }),
      ],
    });

    expect(toWritePayload(draft).credentials).toEqual([
      {
        catalogue_id: first.id,
        earned_at: "2026-01-22",
        evidence_url: "https://example.invalid/certificate",
        evidence_public: false,
      },
    ]);
  });

  it("carries nothing a practitioner may not set", () => {
    const payload = toWritePayload(draftWith({ credentials: [credential()] }));

    for (const key of ["verified", "verified_at", "verified_by", "status", "approved_at"]) {
      expect(payload.profile).not.toHaveProperty(key);
      expect(payload.credentials[0]).not.toHaveProperty(key);
    }
  });
});
