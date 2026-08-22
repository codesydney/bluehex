import { describe, expect, it } from "vitest";

import { emptyDraft, newCredential, type ProfileDraft } from "@/lib/profile-draft";
import {
  earnedDateProblem,
  errorFor,
  isHttpsUrl,
  stepForField,
  validateDraft,
} from "@/lib/profile-validation";

/**
 * What the form refuses, and why each refusal exists.
 *
 * The pairing to hold on to: every rule here has a constraint behind it, and
 * the constraint is what makes it a rule. What this file is checking is that
 * somebody meets the rule as a sentence they can act on rather than as a 400
 * naming `https_url`.
 */

const today = new Date("2026-08-22T00:00:00Z");

function draftWith(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    ...emptyDraft(),
    name: "Mara Ellison",
    contactEmail: "mara@example.invalid",
    ...overrides,
  };
}

function fields(draft: ProfileDraft): string[] {
  return validateDraft(draft, today).map((error) => error.field);
}

describe("a complete draft", () => {
  it("has nothing wrong with it", () => {
    expect(validateDraft(draftWith(), today)).toEqual([]);
  });

  it("needs a name, because the name is what the badge attests to", () => {
    expect(fields(draftWith({ name: "" }))).toContain("name");
    expect(fields(draftWith({ name: "   " }))).toContain("name");
  });

  it("needs a contact email, and it is never published", () => {
    expect(fields(draftWith({ contactEmail: "" }))).toContain("contactEmail");
    expect(fields(draftWith({ contactEmail: "mara at example" }))).toContain("contactEmail");
  });

  it("asks for nothing else", () => {
    /* Everything but the name and the email is optional in the schema, and a
       form that demands more than the column does is inventing a rule. */
    const bare = { ...emptyDraft(), name: "A", contactEmail: "a@b.example" };

    expect(validateDraft(bare, today)).toEqual([]);
  });
});

describe("a published link", () => {
  /* `public.https_url`: https:// required, a host with a dot in it, no
     whitespace, 2048 characters. Every one of these columns is rendered as an
     `href`, which is why the scheme is constrained rather than trusted. */

  it("takes an ordinary https address", () => {
    expect(isHttpsUrl("https://example.invalid")).toBe(true);
    expect(isHttpsUrl("https://github.com/example/repo?tab=readme")).toBe(true);
    expect(isHttpsUrl("HTTPS://Example.Invalid")).toBe(true);
  });

  it("refuses what the domain refuses", () => {
    expect(isHttpsUrl("")).toBe(false);
    expect(isHttpsUrl("http://example.invalid")).toBe(false);
    expect(isHttpsUrl("https://localhost")).toBe(false);
    expect(isHttpsUrl("https:///foo")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("example.invalid")).toBe(false);
    expect(isHttpsUrl("https://exa mple.invalid")).toBe(false);
    expect(isHttpsUrl(`https://example.invalid/${"a".repeat(2048)}`)).toBe(false);
  });

  it("is checked on each of the four link fields", () => {
    expect(
      fields(
        draftWith({
          websiteUrl: "example.invalid",
          githubUrl: "http://github.com/x",
          linkedinUrl: "linkedin.com/in/x",
          bookingUrl: "ftp://example.invalid",
        }),
      ),
    ).toEqual(["websiteUrl", "githubUrl", "linkedinUrl", "bookingUrl"]);
  });

  it("says https:// when that is the whole problem", () => {
    const errors = validateDraft(draftWith({ websiteUrl: "http://example.invalid" }), today);

    expect(errorFor(errors, "websiteUrl")).toContain("https://");
  });

  it("leaves an empty optional link alone", () => {
    /* An untouched field is not an error — it is a null on the way out. */
    expect(fields(draftWith({ websiteUrl: "", bookingUrl: "" }))).toEqual([]);
  });
});

describe("a credential", () => {
  it("needs a credential picked and a date, both of which are not null columns", () => {
    const draft = draftWith({ credentials: [newCredential("k")] });

    expect(fields(draft)).toEqual(["credentials.k.catalogueId", "credentials.k.earnedAt"]);
  });

  it("takes a certificate link only in the shape the column takes", () => {
    const draft = draftWith({
      credentials: [
        {
          key: "k",
          catalogueId: "some-id",
          earnedAt: "2026-01-22",
          evidenceUrl: "certificate.example",
          evidencePublic: true,
        },
      ],
    });

    expect(fields(draft)).toEqual(["credentials.k.evidenceUrl"]);
  });

  it("does not treat an opt-in with no link as an error", () => {
    /* It is a state the database takes, and the panel says so where the
       checkbox is. Refusing the whole submission over it would be the form
       inventing a rule the model does not have. */
    const draft = draftWith({
      credentials: [
        {
          key: "k",
          catalogueId: "some-id",
          earnedAt: "2026-01-22",
          evidenceUrl: "",
          evidencePublic: true,
        },
      ],
    });

    expect(fields(draft)).toEqual([]);
  });
});

describe("the day on the certificate", () => {
  it("takes a real day, in the format the column is written in", () => {
    expect(earnedDateProblem("2026-01-22", today)).toBeNull();
  });

  it("refuses a day that is not on the calendar", () => {
    /* `new Date("2026-02-31")` rolls over to 3 March rather than throwing, so
       the round trip is what catches it. */
    expect(earnedDateProblem("2026-02-31", today)).not.toBeNull();
    expect(earnedDateProblem("22/01/2026", today)).not.toBeNull();
    expect(earnedDateProblem("", today)).not.toBeNull();
  });

  it("refuses one in the future, because a certificate is earned on a day that happened", () => {
    expect(earnedDateProblem("2026-08-22", today)).toBeNull();
    expect(earnedDateProblem("2026-08-23", today)).not.toBeNull();
  });
});

describe("the services cap", () => {
  it("is checked as well as shown", () => {
    /* The picker disables what would exceed it, so this catches a draft that
       arrived over the cap rather than a click — and it is the same number the
       trigger enforces. */
    const draft = draftWith({
      services: ["Code review", "Implementation", "Team training", "One-to-one tutoring"],
    });

    expect(fields(draft)).toEqual(["services"]);
  });

  it("is content with three, and with none", () => {
    expect(fields(draftWith({ services: ["Code review", "Implementation", "Team training"] }))).toEqual(
      [],
    );
    expect(fields(draftWith({ services: [] }))).toEqual([]);
  });
});

describe("where an error sends you", () => {
  it("names the step the field is on", () => {
    expect(stepForField("name")).toBe(0);
    expect(stepForField("websiteUrl")).toBe(0);
    expect(stepForField("services")).toBe(0);
    expect(stepForField("credentials.k.earnedAt")).toBe(1);
    expect(stepForField("contactEmail")).toBe(2);
  });

  it("lists problems in the order the steps ask for them", () => {
    /* The form sends somebody to the *first* error, so a contact error must not
       outrank a name error two steps earlier. */
    const draft = draftWith({
      name: "",
      contactEmail: "",
      credentials: [newCredential("k")],
    });

    expect(fields(draft)).toEqual([
      "name",
      "credentials.k.catalogueId",
      "credentials.k.earnedAt",
      "contactEmail",
    ]);
    expect(stepForField(validateDraft(draft, today)[0].field)).toBe(0);
  });
});
