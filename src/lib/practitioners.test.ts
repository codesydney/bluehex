import { describe, expect, it } from "vitest";
import {
  byCatalogueOrder,
  countryName,
  credentialSource,
  hasVerifiedBadge,
  isCertified,
  isProfileHandle,
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

describe("catalogue order", () => {
  /* `sort_order` restarts at 0 per platform, so the two groups collide on every
     low number. These are the real colliding rows from the seed. */
  const numbered = (kind: CatalogueEntry["kind"], label: string, sortOrder: number) => ({
    ...entry(kind, label),
    sortOrder,
  });

  it("keeps the Academy track together rather than interleaving the exams", () => {
    const scrambled = [
      numbered("certification", "Claude Certified Associate - Foundations (CCAO-F)", 0),
      numbered("course", "Claude 101", 0),
      numbered("certification", "Claude Certified Architect - Foundations (CCAR-F)", 1),
      numbered("course", "Claude Code 101", 1),
    ];

    expect([...scrambled].sort(byCatalogueOrder).map((item) => item.label)).toEqual([
      "Claude 101",
      "Claude Code 101",
      "Claude Certified Associate - Foundations (CCAO-F)",
      "Claude Certified Architect - Foundations (CCAR-F)",
    ]);
  });

  it("breaks the last tie on the label, so the order is stable rather than merely sorted", () => {
    const tied = [numbered("course", "Beta", 4), numbered("course", "Alpha", 4)];

    expect([...tied].sort(byCatalogueOrder).map((item) => item.label)).toEqual(["Alpha", "Beta"]);
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
  it("is the handle and nothing else", () => {
    expect(profilePath({ handle: "seed0001" })).toBe("/p/seed0001");
  });

  it("does not read the name, so a rename cannot move a published URL", () => {
    /* The whole of #119, as a type and as a value. `profilePath` takes
       `Pick<Profile, "handle">`, so a caller cannot even pass a name — the older
       signature emitted `/p/mara-ellison-2f1a3c` and this one could not produce
       that string if it wanted to. The name is display text; the identifier is a
       column. */
    const person = { handle: "seed0001", name: "Mara Ellison" };
    const renamed = { ...person, name: "Her New Name" };

    expect(profilePath(person)).toBe(profilePath(renamed));
    expect(profilePath(person)).not.toContain("mara");
  });
});

describe("what could be a handle", () => {
  it("accepts eight lowercase Crockford base32 characters", () => {
    expect(isProfileHandle("seed0001")).toBe(true);
    /* Every symbol in the alphabet, in two handles, so a predicate that had
       quietly dropped one would fail here rather than in production on one
       profile in sixteen. */
    expect(isProfileHandle("01234567")).toBe(true);
    expect(isProfileHandle("89abcdef")).toBe(true);
    expect(isProfileHandle("ghjkmnpq")).toBe(true);
    expect(isProfileHandle("rstvwxyz")).toBe(true);
  });

  it("rejects the four letters Crockford leaves out", () => {
    /* `i`, `l`, `o` and `u` are excluded so a handle read aloud or copied off a
       screen is unambiguous. A predicate that accepted them would accept a
       string `new_profile_handle()` cannot produce and the column constraint
       would refuse — a handle that can never match a row. */
    for (const letter of ["i", "l", "o", "u"]) {
      expect(isProfileHandle(`seed000${letter}`)).toBe(false);
    }
  });

  it("rejects anything that is not exactly eight of them", () => {
    expect(isProfileHandle("seed001")).toBe(false);
    expect(isProfileHandle("seed00011")).toBe(false);
    expect(isProfileHandle("")).toBe(false);
    /* Uppercase is a different handle rather than the same one. Crockford's own
       specification folds case on input; folding here would give one profile
       several URLs, which is what dropping the slug removed. */
    expect(isProfileHandle("SEED0001")).toBe(false);
    /* The shapes that arrive from a URL and are not handles at all. */
    expect(isProfileHandle("mara-ellison-2f1a3c")).toBe(false);
    expect(isProfileHandle("../../etc")).toBe(false);
    /* Anchored at both ends: a valid handle wearing a suffix is not one. */
    expect(isProfileHandle("seed0001\nseed0002")).toBe(false);
  });
});

describe("country names", () => {
  it("survives a lowercase code, which fails silently rather than throwing", () => {
    expect(countryName("au")).toBe("Australia");
    expect(countryName("usa")).toBe("usa");
  });
});
