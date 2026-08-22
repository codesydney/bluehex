import { describe, expect, it } from "vitest";

import { reviewQueueFixtures } from "./queue.fixtures";
import {
  badgeShows,
  checkable,
  countByFilter,
  hasDrifted,
  matchesFilter,
  openableEvidence,
  outstanding,
  partitionQueue,
  sortQueue,
  stampVerification,
  unchecked,
  type CatalogueEntry,
  type QueueCredential,
  type QueueProfile,
} from "./queue";

/**
 * The queue's rules, and the fixtures they were written against.
 *
 * The awkward profiles are asserted by name rather than by shape. They are the
 * output of a whole design round — each one a different kind of hard, two of
 * them hard while entirely innocent — and a test that reproduced their shape
 * inline would let somebody delete the person and keep the green tick.
 */

const entry: CatalogueEntry = {
  id: "c1",
  kind: "course",
  platform: "Anthropic Academy",
  label: "Claude 101",
};

function credential(rest: Partial<QueueCredential> = {}): QueueCredential {
  return {
    id: "c",
    entry,
    earnedAt: "2026-01-01",
    evidenceUrl: null,
    evidencePublic: false,
    verified: false,
    verifiedAt: null,
    verifiedBy: null,
    ...rest,
  };
}

function profile(rest: Partial<QueueProfile> = {}): QueueProfile {
  return {
    id: "p",
    name: "Somebody",
    headline: "",
    location: "",
    bio: "",
    focus: [],
    services: [],
    contactEmail: "somebody@example.invalid",
    status: "pending",
    owner: "somebody@example.invalid",
    updatedAt: "2026-08-01T00:00:00Z",
    lastVerifiedAt: null,
    reviewNote: null,
    credentials: [],
    ...rest,
  };
}

const queue = reviewQueueFixtures();
const byName = (name: string) => {
  const found = queue.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`fixture "${name}" is gone`);
  return found;
};

describe("the adversarial population", () => {
  it("is still nine people, four of them awkward on purpose", () => {
    expect(queue).toHaveLength(9);
    for (const name of ["Marcus Bell", "Tomas Novak", "Aroha Ngata", "Hae-Won Park"]) {
      expect(() => byName(name)).not.toThrow();
    }
  });

  it("keeps Tomas Novak's evidence byte-identical to one of Priya's", () => {
    /* The theft is only ever catchable across profiles, which is the hole this
       shape structurally has. If the URLs ever stop matching, the fixture has
       stopped testing anything. */
    const stolen = byName("Tomas Novak").credentials[0]!;
    const originals = byName("Priya Raghavan").credentials.map((c) => c.evidenceUrl);

    expect(originals).toContain(stolen.evidenceUrl);
  });

  it("keeps them on the same catalogue entry, which is legal and unhelpful", () => {
    /* `unique (practitioner_id, catalogue_id)` is scoped to one practitioner, so
       two people claiming the same entry is the normal case. It is exactly what
       makes the claim legal. */
    const stolen = byName("Tomas Novak").credentials[0]!;
    const originals = byName("Priya Raghavan").credentials.map((c) => c.entry.id);

    expect(originals).toContain(stolen.entry.id);
  });

  it("keeps Marcus Bell capped at three services while claiming five focus areas", () => {
    const marcus = byName("Marcus Bell");

    expect(marcus.services).toHaveLength(3);
    expect(marcus.focus.length).toBeGreaterThan(3);
  });

  it("gives Devon Achebe no credentials and a bio that claims progress", () => {
    /* If a design tempts an admin to treat "working through the Academy track"
       as something to check, the confusion in-progress rows caused has moved
       into the bio rather than been removed. */
    const devon = byName("Devon Achebe");

    expect(devon.credentials).toHaveLength(0);
    expect(devon.bio).toContain("working through the Academy track");
    expect(devon.owner).not.toBeNull();
  });

  it("keeps Ines Delacroix unclaimed and asserting nothing", () => {
    const ines = byName("Ines Delacroix");

    expect(ines.owner).toBeNull();
    expect(ines.credentials).toHaveLength(0);
  });

  it("has no in-progress credential anywhere", () => {
    for (const person of queue) {
      for (const held of person.credentials) {
        expect(held.earnedAt).toBeTruthy();
      }
    }
  });

  it("hands out a fresh copy each read, so a mutation cannot leak between tests", () => {
    const first = reviewQueueFixtures();
    first[0]!.status = "rejected";

    expect(reviewQueueFixtures()[0]!.status).toBe("pending");
  });
});

describe("unchecked and checkable", () => {
  it("agree on an ordinary unverified credential with evidence", () => {
    const person = profile({ credentials: [credential({ evidenceUrl: "https://e.invalid/a" })] });

    expect(unchecked(person)).toHaveLength(1);
    expect(checkable(person)).toHaveLength(1);
  });

  it("part company on an earned credential with no evidence URL", () => {
    /* Hae-Won Park. The badge is waiting on it forever; there is nothing an
       admin can do about it, and it is not a rejection. */
    const haewon = byName("Hae-Won Park");

    expect(unchecked(haewon)).toHaveLength(1);
    expect(checkable(haewon)).toHaveLength(0);
  });

  it("both ignore a credential somebody has already checked", () => {
    const person = profile({
      credentials: [credential({ evidenceUrl: "https://e.invalid/a", verified: true })],
    });

    expect(unchecked(person)).toHaveLength(0);
    expect(checkable(person)).toHaveLength(0);
  });
});

describe("evidence a browser may be pointed at", () => {
  it("passes an ordinary https address through", () => {
    expect(openableEvidence("https://anthropic.skilljar.com/certificate/x")).toBe(
      "https://anthropic.skilljar.com/certificate/x",
    );
  });

  it("is case-insensitive, because the domain's check is", () => {
    /* `evidence_url` is `public.https_url`, whose check uses `~*`. A guard
       stricter than the constraint would refuse a row Postgres accepted. */
    expect(openableEvidence("HTTPS://example.invalid/a")).toBe("HTTPS://example.invalid/a");
  });

  it("refuses every scheme that is not https", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "http://example.invalid/a",
      "file:///etc/passwd",
      "//example.invalid/a",
    ]) {
      expect(openableEvidence(hostile)).toBeNull();
    }
  });

  it("refuses a leading-whitespace scheme, which a browser would strip and resolve", () => {
    expect(openableEvidence(" javascript:alert(1)")).toBeNull();
    expect(openableEvidence("\njavascript:alert(1)")).toBeNull();
  });

  it("passes null through", () => {
    expect(openableEvidence(null)).toBeNull();
  });
});

describe("the badge rollup", () => {
  it("needs at least one credential", () => {
    expect(badgeShows([])).toBe(false);
  });

  it("needs every one of them verified", () => {
    expect(badgeShows([credential({ verified: true }), credential({ verified: false })])).toBe(
      false,
    );
    expect(badgeShows([credential({ verified: true })])).toBe(true);
  });

  it("is held back by an earned credential with no evidence, which is correct", () => {
    /* It is in the rollup on purpose: the practitioner can close it by pasting
       a link, where nobody could ever act on an in-progress row. */
    expect(badgeShows(byName("Hae-Won Park").credentials)).toBe(false);
  });
});

describe("why a profile is in the queue", () => {
  it("counts a pending profile as needing a decision", () => {
    expect(outstanding(profile()).map((reason) => reason.kind)).toEqual(["decision"]);
  });

  it("counts certificates an admin can actually open, not the badge's backlog", () => {
    /* Hae-Won Park is pending and has one unchecked credential, and the queue
       must show one job rather than two — the second could never be finished. */
    expect(outstanding(byName("Hae-Won Park")).map((reason) => reason.kind)).toEqual([
      "decision",
    ]);
  });

  it("empties completely once she is approved", () => {
    /* The permanently-open item must not read as an unfinished task. Approving
       her finishes the profile; the badge simply never shows. */
    const approved = { ...byName("Hae-Won Park"), status: "approved" as const };

    expect(outstanding(approved)).toEqual([]);
    expect(badgeShows(approved.credentials)).toBe(false);
  });

  it("generates no work at all for a profile nobody can see", () => {
    for (const status of ["rejected", "withdrawn"] as const) {
      const hidden = { ...byName("Marcus Bell"), status };
      expect(outstanding(hidden)).toEqual([]);
    }
  });

  it("does not treat an approved, unverified profile as unfinished business", () => {
    /* Published but not vouched for is the normal case, so an approved profile
       with nothing checkable is out of the queue rather than half-done. */
    const person = profile({ status: "approved" });

    expect(outstanding(person)).toEqual([]);
  });

  it("adds drift only once something has been verified", () => {
    const never = profile({ lastVerifiedAt: null, updatedAt: "2026-08-20T00:00:00Z" });
    expect(hasDrifted(never)).toBe(false);

    const drifted = profile({
      status: "approved",
      lastVerifiedAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
      credentials: [credential({ evidenceUrl: "https://e.invalid/a", verified: true })],
    });
    expect(hasDrifted(drifted)).toBe(true);
    expect(outstanding(drifted).map((reason) => reason.kind)).toEqual(["drift"]);
  });
});

describe("order", () => {
  it("puts the longest untouched profile first by default", () => {
    const stamps = sortQueue(queue, "oldest").map((person) => person.updatedAt);

    expect(stamps).toEqual([...stamps].sort());
  });

  it("reverses on request", () => {
    const stamps = sortQueue(queue, "newest").map((person) => person.updatedAt);

    expect(stamps).toEqual([...stamps].sort().reverse());
  });

  it("breaks ties on id, so the list cannot shuffle between renders", () => {
    const tied = [
      profile({ id: "b", updatedAt: "2026-08-01T00:00:00Z" }),
      profile({ id: "a", updatedAt: "2026-08-01T00:00:00Z" }),
    ];

    expect(sortQueue(tied, "oldest").map((person) => person.id)).toEqual(["a", "b"]);
    expect(sortQueue(tied, "newest").map((person) => person.id)).toEqual(["a", "b"]);
  });

  it("does not mutate what it was given", () => {
    const before = queue.map((person) => person.id);
    sortQueue(queue, "newest");

    expect(queue.map((person) => person.id)).toEqual(before);
  });
});

describe("filter", () => {
  it("shows only profiles with outstanding work, whatever is selected", () => {
    const done = profile({ status: "approved" });

    expect(matchesFilter(done, "all")).toBe(false);
    expect(matchesFilter(done, "decision")).toBe(false);
  });

  it("selects one kind of work using the same reasons the rows show", () => {
    const marcus = byName("Marcus Bell");

    expect(matchesFilter(marcus, "decision")).toBe(true);
    expect(matchesFilter(marcus, "certificates")).toBe(true);
    expect(matchesFilter(marcus, "drift")).toBe(false);
  });

  it("keeps Hae-Won Park out of the certificate filter", () => {
    /* The one thing a filter over "certificates to check" must not do is show
       an admin a job they cannot finish. */
    const haewon = byName("Hae-Won Park");

    expect(matchesFilter(haewon, "decision")).toBe(true);
    expect(matchesFilter(haewon, "certificates")).toBe(false);
  });

  it("counts each kind over the whole queue", () => {
    const counts = countByFilter(queue);

    expect(counts.all).toBe(queue.filter((person) => outstanding(person).length > 0).length);
    expect(counts.decision).toBe(queue.filter((person) => person.status === "pending").length);
    expect(counts.certificates).toBe(
      queue.filter((person) => outstanding(person).some((r) => r.kind === "certificates")).length,
    );
  });
});

describe("partitioning the list", () => {
  it("splits work from everything already dealt with", () => {
    const { open, cleared } = partitionQueue(queue, { filter: "all", order: "oldest" });

    expect(open.every((person) => outstanding(person).length > 0)).toBe(true);
    expect(cleared.every((person) => outstanding(person).length === 0)).toBe(true);
    expect(open.length + cleared.length).toBe(queue.length);
  });

  it("does not filter the reviewed list, which names no kind of work", () => {
    const all = partitionQueue(queue, { filter: "all", order: "oldest" });
    const narrow = partitionQueue(queue, { filter: "drift", order: "oldest" });

    expect(narrow.open.length).toBeLessThan(all.open.length);
    expect(narrow.cleared.map((person) => person.id)).toEqual(
      all.cleared.map((person) => person.id),
    );
  });
});

describe("stamping a verification", () => {
  it("records who looked and when", () => {
    const person = profile({ credentials: [credential({ id: "x", evidenceUrl: "https://e/a" })] });
    const after = stampVerification(person, "x", true, {
      by: "david",
      at: "2026-08-20T10:00:00Z",
    });

    expect(after.credentials[0]!.verified).toBe(true);
    expect(after.credentials[0]!.verifiedBy).toBe("david");
    expect(after.credentials[0]!.verifiedAt).toBe("2026-08-20T10:00:00Z");
    expect(after.lastVerifiedAt).toBe("2026-08-20T10:00:00Z");
  });

  it("clears the attribution when a check is undone", () => {
    const person = profile({
      credentials: [
        credential({
          id: "x",
          evidenceUrl: "https://e/a",
          verified: true,
          verifiedAt: "2026-08-20T10:00:00Z",
          verifiedBy: "david",
        }),
      ],
    });
    const after = stampVerification(person, "x", false, { by: "sam", at: "2026-08-21T10:00:00Z" });

    expect(after.credentials[0]!.verified).toBe(false);
    expect(after.credentials[0]!.verifiedBy).toBeNull();
    expect(after.credentials[0]!.verifiedAt).toBeNull();
  });

  it("never moves lastVerifiedAt backwards when the newest check is undone", () => {
    /* The bug: a `max()` over the live rows alone is not monotonic. Undo the
       most recent check and the maximum drops to an older stamp, `updatedAt` is
       suddenly greater than it, and a profile nobody edited reads "Edited since
       checked". Drift decides queue membership, so that is a phantom item. */
    const person = profile({
      status: "approved",
      updatedAt: "2026-08-10T00:00:00Z",
      lastVerifiedAt: "2026-08-12T00:00:00Z",
      credentials: [
        credential({
          id: "old",
          evidenceUrl: "https://e/a",
          verified: true,
          verifiedAt: "2026-08-11T00:00:00Z",
          verifiedBy: "david",
        }),
        credential({
          id: "new",
          evidenceUrl: "https://e/b",
          verified: true,
          verifiedAt: "2026-08-12T00:00:00Z",
          verifiedBy: "david",
        }),
      ],
    });

    const after = stampVerification(person, "new", false, {
      by: "david",
      at: "2026-08-13T00:00:00Z",
    });

    expect(after.lastVerifiedAt).toBe("2026-08-12T00:00:00Z");
    expect(hasDrifted(after)).toBe(false);
  });

  it("leaves lastVerifiedAt null on a profile nothing was ever checked on", () => {
    const person = profile({ credentials: [credential({ id: "x", evidenceUrl: "https://e/a" })] });
    const after = stampVerification(person, "x", false, {
      by: "david",
      at: "2026-08-20T10:00:00Z",
    });

    expect(after.lastVerifiedAt).toBeNull();
  });

  it("clears drift when the last check catches up with the last edit", () => {
    const drifted = profile({
      status: "approved",
      updatedAt: "2026-08-12T00:00:00Z",
      lastVerifiedAt: "2026-08-09T00:00:00Z",
      credentials: [
        credential({
          id: "x",
          evidenceUrl: "https://e/a",
          verified: true,
          verifiedAt: "2026-08-09T00:00:00Z",
          verifiedBy: "david",
        }),
      ],
    });
    expect(hasDrifted(drifted)).toBe(true);

    const rechecked = stampVerification(drifted, "x", true, {
      by: "david",
      at: "2026-08-13T00:00:00Z",
    });

    expect(hasDrifted(rechecked)).toBe(false);
    expect(outstanding(rechecked)).toEqual([]);
  });

  it("does not mutate the profile it was given", () => {
    const person = profile({ credentials: [credential({ id: "x", evidenceUrl: "https://e/a" })] });
    stampVerification(person, "x", true, { by: "david", at: "2026-08-20T10:00:00Z" });

    expect(person.credentials[0]!.verified).toBe(false);
    expect(person.lastVerifiedAt).toBeNull();
  });
});
