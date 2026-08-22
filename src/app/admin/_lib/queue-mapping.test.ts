import { describe, expect, it } from "vitest";

import {
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

const viewer = { id: "0000-admin-a", label: "admin@bluehex.invalid" };

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
    const profile = toQueueProfile(row({ headline: "Staff engineer" }), viewer);

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
    expect(toQueueProfile(row(), viewer).contactEmail).toBe("mara@example.invalid");
  });

  it("says unclaimed when there is no owner, and names the account when there is", () => {
    expect(toQueueProfile(row(), viewer).owner).toBeNull();
    expect(toQueueProfile(row({ user_id: "acct-7" }), viewer).owner).toBe("acct-7");
  });

  it("takes the review note from its own table, or null when nobody wrote one", () => {
    expect(toQueueProfile(row(), viewer).reviewNote).toBeNull();
    expect(
      toQueueProfile(row({ practitioner_review_notes: { note: "Tell us about one engagement." } }), viewer)
        .reviewNote,
    ).toBe("Tell us about one engagement.");
  });

  it("defaults focus to an empty array rather than carrying a null into the render", () => {
    expect(toQueueProfile(row(), viewer).focus).toEqual([]);
    expect(toQueueProfile(row({ focus: ["Agents", "MCP"] }), viewer).focus).toEqual([
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
      viewer,
    );

    /* Catalogue first in catalogue order, custom after — the same rule the
       public profile applies, so an admin reads the roster's vocabulary in the
       roster's order. */
    expect(profile.services).toEqual(["Tutoring", "Agent rescue work"]);
  });

  it("has no services when the embed came back empty", () => {
    expect(toQueueProfile(row(), viewer).services).toEqual([]);
  });
});

describe("credentials", () => {
  it("embeds the catalogue entry rather than any text the practitioner typed", () => {
    const [held] = toQueueProfile(
      row({ practitioner_credentials: [credentialRow()] }),
      viewer,
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
      viewer,
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
      viewer,
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
      viewer,
    );

    expect(profile.credentials.map((held) => held.id)).toEqual(["z", "a", "b"]);
  });
});

describe("who checked it, and when", () => {
  it("names the reviewer reading the screen when the check is theirs", () => {
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ verified: true, verified_at: "2026-07-01T10:00:00Z", verified_by: viewer.id }),
        ],
      }),
      viewer,
    ).credentials;

    expect(held!.verifiedBy).toBe("admin@bluehex.invalid");
    expect(held!.verifiedAt).toBe("2026-07-01T10:00:00Z");
  });

  it("says another admin when the check belongs to somebody else", () => {
    /* `verified_by` is a uuid and nothing reachable from PostgREST turns one
       into a person: `auth.users` is not an exposed schema and `public.admins`
       carries no grant to `bluehex_admin`. So the badge's "a named human looked"
       degrades to "a human looked" for anybody but the reader — see the note in
       `queue-mapping.ts`. */
    const [held] = toQueueProfile(
      row({
        practitioner_credentials: [
          credentialRow({ verified: true, verified_at: "2026-07-01T10:00:00Z", verified_by: "someone-else" }),
        ],
      }),
      viewer,
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
      viewer,
    ).credentials;

    expect(held!.verifiedBy).toBeNull();
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
      viewer,
    );

    expect(profile.lastVerifiedAt).toBe("2026-07-09T10:00:00Z");
  });

  it("is null on a profile nobody has checked, so nothing reads as drifted", () => {
    /* `hasDrifted` compares `updatedAt` against this, and returns false when it
       is null. A profile that has never been checked is not one that was edited
       since it was checked. */
    expect(toQueueProfile(row({ practitioner_credentials: [credentialRow()] }), viewer).lastVerifiedAt)
      .toBeNull();
  });
});
