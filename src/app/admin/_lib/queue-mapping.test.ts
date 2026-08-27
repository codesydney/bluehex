import { describe, expect, it } from "vitest";

import {
  reviewerIds,
  toQueueProfile,
  type QueueCredentialRow,
  type QueueProfileRow,
  type QueueServiceRow,
} from "./queue-mapping";

/**
 * The rows-to-view-model half of the queue's read, asserted without a stack.
 *
 * `queue-read.ts` names the columns and makes the request; everything here
 * turns what comes back into `QueueProfile`. The split is the same one
 * `@/lib/directory` and `@/lib/directory-mapping` already make, and for the
 * same reason: the rules worth asserting — what an absent embed does, how a
 * `verified_by` uuid becomes a name, where `lastVerifiedAt` comes from — are
 * all decisions this file makes and none of them need Postgres to be running.
 */

/**
 * What `queue-read.ts` hands the mapper: the addresses behind the account ids on
 * this screen, keyed by id. A literal here, because the mapper's work starts
 * after the lookup has already happened.
 */
const names: ReadonlyMap<string, string> = new Map([
  ["0000-admin-a", "admin@bluehex.invalid"],
]);

function row(over: Partial<QueueProfileRow> = {}): QueueProfileRow {
  return {
    id: "p1",
    name: "Mara Ellison",
    headline: null,
    location: null,
    bio: null,
    focus: null,
    status: "pending",
    user_id: null,
    updated_at: "2026-08-01T00:00:00Z",
    practitioner_contacts: { contact_email: "mara@example.invalid" },
    practitioner_review_notes: null,
    practitioner_credentials: null,
    practitioner_services: null,
    ...over,
  };
}

function credentialRow(over: Partial<QueueCredentialRow> = {}): QueueCredentialRow {
  return {
    id: "c1",
    earned_at: "2026-06-01",
    evidence_url: null,
    evidence_public: false,
    verified: false,
    verified_at: null,
    verified_by: null,
    credential_catalogue: {
      id: "e1",
      kind: "course",
      platform: "Anthropic Academy",
      label: "Claude 101",
      sort_order: 1,
    },
    ...over,
  };
}

describe("the profile itself", () => {
  it("carries the columns across and leaves an absent one absent", () => {
    const profile = toQueueProfile(row({ headline: "Staff engineer" }), names);

    expect(profile.id).toBe("p1");
    expect(profile.name).toBe("Mara Ellison");
    expect(profile.headline).toBe("Staff engineer");
    /* Not `""`. A column that is null stays null, so the screen can show that
       nothing was written rather than showing an empty string that looks the
       same as a space. */
    expect(profile.location).toBeNull();
    expect(profile.bio).toBeNull();
  });

  it("reads the contact address from the table it lives on, never from the profile", () => {
    /* `practitioner_contacts` exists so that no future `grant select on
       practitioners to anon` can leak an address. The mapper reading it through
       the embed rather than off a profile column is the application side of
       that — see docs/adr/0002. */
    expect(toQueueProfile(row(), names).contactEmail).toBe("mara@example.invalid");
  });

  it("says unclaimed when there is no owner, and names the account when there is", () => {
    expect(toQueueProfile(row(), names).owner).toBeNull();
    expect(toQueueProfile(row({ user_id: "acct-7" }), names).owner).toBe("acct-7");
  });

  it("takes the review note from its own table, or null when nobody wrote one", () => {
    expect(toQueueProfile(row(), names).reviewNote).toBeNull();
    expect(
      toQueueProfile(row({ practitioner_review_notes: { note: "Tell us about one engagement." } }), names)
        .reviewNote,
    ).toBe("Tell us about one engagement.");
  });

  it("defaults focus to an empty array rather than carrying a null into the render", () => {
    expect(toQueueProfile(row(), names).focus).toEqual([]);
    expect(toQueueProfile(row({ focus: ["Agents", "MCP"] }), names).focus).toEqual([
      "Agents",
      "MCP",
    ]);
  });
});

describe("services", () => {
  const catalogued = (label: string, sortOrder: number): QueueServiceRow => ({
    label: null,
    service_catalogue: { label, sort_order: sortOrder },
  });

  it("takes a catalogue service's label from the catalogue and a custom one from the row", () => {
    const profile = toQueueProfile(
      row({
        practitioner_services: [
          { label: "Agent rescue work", service_catalogue: null },
          catalogued("Tutoring", 1),
        ],
      }),
      names,
    );

    /* Catalogue first in catalogue order, custom after — the same rule the
       public profile applies, so an admin reads the roster's vocabulary in the
       roster's order. */
    expect(profile.services).toEqual(["Tutoring", "Agent rescue work"]);
  });

  it("has no services when the embed came back empty", () => {
    expect(toQueueProfile(row(), names).services).toEqual([]);
  });
});

describe("credentials", () => {
  it("embeds the catalogue entry rather than any text the practitioner typed", () => {
    const [held] = toQueueProfile(
      row({ practitioner_credentials: [credentialRow()] }),
      names,
    ).credentials;

    expect(held!.entry).toEqual({
      id: "e1",
      kind: "course",
      platform: "Anthropic Academy",
      label: "Claude 101",
    });
    expect(held!.earnedAt).toBe("2026-06-01");
  });

  it("drops a credential whose catalogue row did not come back", () => {
    /* `catalogue_id` is `not null` with `on delete restrict`, so this cannot
       arise from the data — only from a query that forgot the embed. A
       label-less credential on a review screen is exactly the free text the
       catalogue exists to prevent, so it is dropped rather than rendered. */
    const profile = toQueueProfile(
      row({ practitioner_credentials: [credentialRow({ credential_catalogue: null })] }),
      names,
    );

    expect(profile.credentials).toEqual([]);
  });

  it("reads the raw evidence URL, which is the column only an admin is granted", () => {
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ evidence_url: "https://certificates.invalid/a", evidence_public: false }),
        ],
      }),
      names,
    ).credentials;

    /* `evidence_url_public` is null while `evidence_public` is false, and that
       masking is for `anon`. An admin holds `evidence_url` itself, and reading
       the masked column here would hide from the reviewer the one string the
       whole check is made against. */
    expect(held!.evidenceUrl).toBe("https://certificates.invalid/a");
    expect(held!.evidencePublic).toBe(false);
  });

  it("orders certifications first and then by catalogue order", () => {
    const profile = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({
            id: "b",
            credential_catalogue: {
              id: "e2",
              kind: "course",
              platform: "Anthropic Academy",
              label: "Claude Code in Action",
              sort_order: 5,
            },
          }),
          credentialRow({ id: "a" }),
          credentialRow({
            id: "z",
            credential_catalogue: {
              id: "e9",
              kind: "certification",
              platform: "Pearson VUE",
              label: "Claude Certified Developer",
              sort_order: 1,
            },
          }),
        ],
      }),
      names,
    );

    expect(profile.credentials.map((held) => held.id)).toEqual(["z", "a", "b"]);
  });
});

describe("who checked it, and when", () => {
  it("names the admin whose address the lookup resolved", () => {
    /* Whoever it was. There is no notion of "mine" in the mapper: the reader's
       own check comes out of the same map as everybody else's, so what the
       screen says does not depend on who is reading it. */
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ verified: true, verified_at: "2026-07-01T10:00:00Z", verified_by: "0000-admin-a" }),
        ],
      }),
      names,
    ).credentials;

    expect(held!.verifiedBy).toBe("admin@bluehex.invalid");
    expect(held!.verifiedAt).toBe("2026-07-01T10:00:00Z");
  });

  it("says another admin when the id did not resolve", () => {
    /* "An account is recorded and we could not say whose", which is reachable
       because `auth.users.email` is nullable and `account_emails()` drops a row
       it has no address for rather than returning one with a hole in it.

       Deliberately not null. Null is the separate fact that the row records
       nobody, asserted below, and folding the two together would tell a reviewer
       an attestation was anonymous when it is not. */
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ verified: true, verified_at: "2026-07-01T10:00:00Z", verified_by: "someone-else" }),
        ],
      }),
      names,
    ).credentials;

    expect(held!.verifiedBy).toBe("another Bluehex admin");
  });

  it("names nobody when the row records nobody", () => {
    /* `on delete set null`: the admin's account is gone, or the row was written
       by a privileged path that had no `auth.uid()` to record. The check still
       stands; there is simply no name to put against it. */
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ verified: true, verified_at: "2026-07-01T10:00:00Z", verified_by: null }),
        ],
      }),
      names,
    ).credentials;

    expect(held!.verifiedBy).toBeNull();
  });

  it("invents no check for an unchecked row that records an account anyway", () => {
    /* That state is reachable rather than theoretical. `credentials_guard`
       clears the provenance on the transition out of checked, and a row written
       false to begin with never makes that transition, so a privileged write can
       leave an id on a row nobody has checked.

       `queue-read.ts` resolves addresses only for checked rows, so this id was
       never looked up and the fallback is what the mapper produces. Nothing
       renders it: `review-queue.tsx` draws the whole "Checked by" block inside
       `credential.verified`. What matters here is the two fields below, which are
       what the screen actually reads, and neither is invented from the third. */
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ verified: false, verified_at: null, verified_by: "0000-admin-a" }),
        ],
      }),
      names,
    ).credentials;

    expect(held!.verified).toBe(false);
    expect(held!.verifiedAt).toBeNull();
  });
});

describe("lastVerifiedAt", () => {
  it("is the most recent check across the profile's credentials", () => {
    const profile = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ id: "a", verified: true, verified_at: "2026-07-01T10:00:00Z" }),
          credentialRow({ id: "b", verified: true, verified_at: "2026-07-09T10:00:00Z" }),
          credentialRow({ id: "c" }),
        ],
      }),
      names,
    );

    expect(profile.lastVerifiedAt).toBe("2026-07-09T10:00:00Z");
  });

  it("is null on a profile nobody has checked, so nothing reads as drifted", () => {
    /* `hasDrifted` compares `updatedAt` against this, and returns false when it
       is null. A profile that has never been checked is not one that was edited
       since it was checked. */
    expect(toQueueProfile(row({ practitioner_credentials: [credentialRow()] }), names).lastVerifiedAt)
      .toBeNull();
  });
});

describe("which ids the queue asks to resolve", () => {
  /* `reviewerIds` decides what `queue-read.ts` sends to `account_emails()`. It
     lives here rather than beside the request so the rule can be asserted
     without a stack, which is the same split the read itself is built on. */

  it("collects the account behind a checked credential", () => {
    const ids = reviewerIds([
      row({
        practitioner_credentials: [credentialRow({ verified: true, verified_by: "0000-admin-a" })],
      }),
    ]);

    expect(ids).toEqual(["0000-admin-a"]);
  });

  it("skips an unchecked credential even when it records an account", () => {
    /* The state is reachable: `credentials_guard` clears the provenance on the
       transition out of checked, and a row written false to begin with never
       makes that transition. The screen draws the name inside
       `credential.verified`, so resolving this id would buy an address nobody
       sees. */
    const ids = reviewerIds([
      row({
        practitioner_credentials: [credentialRow({ verified: false, verified_by: "0000-admin-a" })],
      }),
    ]);

    expect(ids).toEqual([]);
  });

  it("skips a checked credential that records nobody", () => {
    /* `verified_by` is `on delete set null`, so this is the admin whose account
       is gone. There is no id to resolve and the screen says so in its own
       words. */
    const ids = reviewerIds([
      row({
        practitioner_credentials: [credentialRow({ verified: true, verified_by: null })],
      }),
    ]);

    expect(ids).toEqual([]);
  });

  it("asks once for an admin who checked several credentials across several profiles", () => {
    /* The ordinary case rather than an edge one: a queue is mostly one person's
       work. Sending the id once keeps the payload proportional to the admins on
       screen rather than to the credentials. */
    const ids = reviewerIds([
      row({
        id: "p1",
        practitioner_credentials: [
          credentialRow({ id: "c1", verified: true, verified_by: "0000-admin-a" }),
          credentialRow({ id: "c2", verified: true, verified_by: "0000-admin-a" }),
          credentialRow({ id: "c3", verified: true, verified_by: "0000-admin-b" }),
        ],
      }),
      row({
        id: "p2",
        practitioner_credentials: [
          credentialRow({ id: "c4", verified: true, verified_by: "0000-admin-a" }),
        ],
      }),
    ]);

    expect([...ids].sort()).toEqual(["0000-admin-a", "0000-admin-b"]);
  });

  it("asks for nothing when no credential on the page has been checked", () => {
    /* What the read short-circuits on. A queue of fresh submissions is the
       normal morning, so this is the common path rather than the empty one. */
    expect(reviewerIds([row({ practitioner_credentials: [credentialRow()] })])).toEqual([]);
    expect(reviewerIds([])).toEqual([]);
  });

  it("asks for nothing when the credentials embed came back absent", () => {
    /* The row type is deliberately wider than the query, so an absent
       collection is a shape this has to state an answer for rather than assume
       away. */
    expect(reviewerIds([row()])).toEqual([]);
  });
});
