import { describe, expect, it } from "vitest";
import {
  countryName,
  credentialSource,
  hasVerifiedBadge,
  isCertified,
  profilePath,
  services,
  vocabularyServices,
  type CatalogueEntry,
  type Credential,
} from "@/lib/practitioners";

/* The population is the one `supabase/seed.sql` loads, because it was chosen to
   cover branches rather than to look like a market: somebody who earns the
   badge, somebody held back by a single unverified row, somebody holding claims
   nobody has checked, and somebody holding nothing at all. Asserting against the
   same set here means the unit tests and a `pnpm db:reset` disagree loudly
   rather than quietly. */

function entry(kind: CatalogueEntry["kind"], label: string): CatalogueEntry {
  return {
    id: `cat-${label}`,
    kind,
    platform: kind === "certification" ? "Pearson VUE" : "Anthropic Academy",
    label,
    courseUrl: null,
    active: true,
    sortOrder: 0,
  };
}

function held(entryFor: CatalogueEntry, verified: boolean): Credential {
  return { entry: entryFor, earnedAt: "2026-01-22", verified, evidenceUrl: null };
}

const claude101 = entry("course", "Claude 101");
const claudeCode101 = entry("course", "Claude Code 101");
const developerCert = entry("certification", "Claude Certified Developer - Foundations (CCDV-F)");

describe("the Verified badge", () => {
  it("is withheld from a profile holding nothing — Devon", () => {
    /* The case the directory exists to include and the one a credential-shaped
       model most easily excludes. No credentials is a normal profile, not a
       broken one, and it must never read as a failed check. */
    expect(hasVerifiedBadge([])).toBe(false);
  });

  it("is earned when every credential has been checked — Mara", () => {
    expect(hasVerifiedBadge([held(claude101, true), held(claudeCode101, true)])).toBe(true);
  });

  it("is withheld by one unchecked credential — Toby", () => {
    /* The profile that proves the rollup is "every credential verified" rather
       than "any credential verified". The two read identically on a profile
       holding one, which is why the seed carries somebody holding two. */
    expect(hasVerifiedBadge([held(claude101, true), held(claudeCode101, false)])).toBe(false);
  });

  it("is withheld from claims nobody has checked — Hollis", () => {
    expect(
      hasVerifiedBadge([
        held(claude101, false),
        held(claudeCode101, false),
        held(entry("course", "Introduction to agent skills"), false),
      ]),
    ).toBe(false);
  });

  it("does not care what kind of credential earned it", () => {
    /* Recorded because the prototype's NOTES flagged it as a finding rather
       than a bug: badges appear from week one, earned entirely on Academy
       certificates, and nobody holds a Certification. Narrowing the rollup to
       certifications is a change to the model, not a copy change. */
    expect(hasVerifiedBadge([held(claude101, true)])).toBe(true);
  });
});

describe("certified", () => {
  it("is true only where a certification is held — Priya", () => {
    expect(isCertified([held(developerCert, true)])).toBe(true);
  });

  it("is false for a profile holding only courses, verified or not", () => {
    expect(isCertified([held(claude101, true), held(claudeCode101, true)])).toBe(false);
    expect(isCertified([])).toBe(false);
  });

  it("does not depend on Bluehex having checked it", () => {
    /* `certified` is self-asserted and governs nothing; `verified` is Bluehex's
       check. They are separate ideas and either can be true without the other,
       which is the whole reason neither is stored beside the other. */
    expect(isCertified([held(developerCert, false)])).toBe(true);
    expect(hasVerifiedBadge([held(developerCert, false)])).toBe(false);
  });
});

describe("what a credential says it came from", () => {
  it("names the weight for a certification and the platform for a course", () => {
    expect(credentialSource(developerCert)).toBe("Claude Certification");
    expect(credentialSource(claude101)).toBe("Anthropic Academy");
  });
});

describe("the built-in service vocabulary", () => {
  it("keeps the order the catalogue was seeded in, not alphabetical", () => {
    /* Alphabetical would lead with "Architecture and advisory" for no reason.
       `20260820201450_catalogues.sql` seeded `service_catalogue` from this
       array with the index as `sort_order`, so the two orders are one order. */
    expect(vocabularyServices.map((option) => option.label)).toEqual([...services]);
    expect(vocabularyServices.map((option) => option.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("where a profile lives", () => {
  it("resolves on the uuid rather than the name", () => {
    expect(profilePath({ id: "2f1a3c9d-4b7e-4c21-9a86-1d0f5e83b7c4", name: "Mara Ellison" })).toBe(
      "/p/mara-ellison-2f1a3c",
    );
  });

  it("drops the slug rather than leading with a bare hyphen", () => {
    expect(profilePath({ id: "9f3c1a00-0000-4000-8000-000000000000", name: "李雷" })).toBe(
      "/p/9f3c1a",
    );
  });
});

describe("country names", () => {
  it("survives a lowercase code, which fails silently rather than throwing", () => {
    expect(countryName("au")).toBe("Australia");
    expect(countryName("usa")).toBe("usa");
  });
});
