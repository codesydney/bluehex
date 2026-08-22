import { describe, expect, it } from "vitest";

import type { Service } from "@/lib/practitioners";
import {
  planCredentials,
  planServices,
  type CredentialWrite,
  type SavedCredential,
  type SavedService,
} from "./profile-plan";

/**
 * What a save does to the two child tables, asserted without a stack.
 *
 * The editor submits a whole profile rather than a diff, so every insert,
 * update and delete on `practitioner_credentials` and `practitioner_services` is
 * decided here. Three of the rules below exist because a constraint would
 * otherwise refuse the write with a message naming itself rather than the
 * mistake — the unique pair, the services cap, and `credentials_guard` clearing
 * a check that nothing actually changed.
 */

function saved(over: Partial<SavedCredential> = {}): SavedCredential {
  return {
    id: "cr1",
    catalogue_id: "cat1",
    earned_at: "2026-01-22",
    evidence_url: null,
    evidence_public: false,
    ...over,
  };
}

function wanted(over: Partial<CredentialWrite> = {}): CredentialWrite {
  return {
    catalogue_id: "cat1",
    earned_at: "2026-01-22",
    evidence_url: null,
    evidence_public: false,
    ...over,
  };
}

describe("planCredentials", () => {
  it("inserts what is new", () => {
    const plan = planCredentials([], [wanted()]);

    expect(plan.insert).toEqual([wanted()]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("removes what the form no longer holds", () => {
    const plan = planCredentials([saved()], []);

    expect(plan.remove).toEqual(["cr1"]);
    expect(plan.insert).toEqual([]);
  });

  /* `updated_at` is served to the owner, and a row that reports a change every
     time somebody presses Save on an untouched credential is a row that answers
     "when did this last change" wrongly. */
  it("leaves an unchanged credential alone entirely", () => {
    const plan = planCredentials([saved()], [wanted()]);

    expect(plan).toEqual({ insert: [], update: [], remove: [] });
  });

  it("updates a credential whose date or evidence moved", () => {
    const plan = planCredentials([saved()], [wanted({ earned_at: "2026-02-01" })]);

    expect(plan.update).toEqual([{ id: "cr1", row: wanted({ earned_at: "2026-02-01" }) }]);
  });

  /* The opt-in is in this comparison and not in `credentials_guard`'s clearing
     list, because the two answer different questions: "has anything changed"
     against "has the *claim* changed". Conflating them drops a real edit. */
  it("updates when only the publish opt-in moved, and the check survives it", () => {
    const plan = planCredentials([saved()], [wanted({ evidence_public: true })]);

    expect(plan.update).toEqual([{ id: "cr1", row: wanted({ evidence_public: true }) }]);
  });

  /* Repicking which credential a row claims is a delete and an insert rather
     than an update, and that is what keeps the two edits commutative:
     `unique (practitioner_id, catalogue_id)` refuses an insert of an entry that
     is still on another row, so a plan that updated in place would depend on
     the order the rows happened to arrive in. */
  it("reads a repick as a removal and an addition", () => {
    const plan = planCredentials([saved()], [wanted({ catalogue_id: "cat2" })]);

    expect(plan.remove).toEqual(["cr1"]);
    expect(plan.insert).toEqual([wanted({ catalogue_id: "cat2" })]);
    expect(plan.update).toEqual([]);
  });

  /* The picker disables an entry already on the profile, so this is not
     reachable through the form — and the payload arrives from a browser, where
     the constraint would answer `23505` naming itself. */
  it("does not send one credential twice", () => {
    const plan = planCredentials([], [wanted(), wanted({ earned_at: "2020-01-01" })]);

    expect(plan.insert).toEqual([wanted()]);
  });

  it("handles a swap of one credential for another", () => {
    const plan = planCredentials(
      [saved(), saved({ id: "cr2", catalogue_id: "cat2" })],
      [wanted(), wanted({ catalogue_id: "cat3" })],
    );

    expect(plan.remove).toEqual(["cr2"]);
    expect(plan.insert).toEqual([wanted({ catalogue_id: "cat3" })]);
    expect(plan.update).toEqual([]);
  });
});

describe("planServices", () => {
  const catalogue = [
    { id: "s1", label: "Code review" },
    { id: "s2", label: "Team training" },
    { id: "s3", label: "Implementation" },
  ];

  function service(over: Partial<SavedService> = {}): SavedService {
    return { id: "row1", catalogue_id: "s1", label: null, ...over };
  }

  it("inserts a service the profile did not have", () => {
    const plan = planServices([], ["Code review"] as Service[], catalogue);

    expect(plan.insert).toEqual(["s1"]);
    expect(plan.remove).toEqual([]);
  });

  it("removes one the form no longer holds, by row id", () => {
    const plan = planServices([service()], [], catalogue);

    expect(plan.remove).toEqual(["row1"]);
  });

  it("leaves an unchanged service alone", () => {
    const plan = planServices([service()], ["Code review"] as Service[], catalogue);

    expect(plan).toEqual({ insert: [], remove: [] });
  });

  /* The chips render the closed vocabulary and a labelled row has no control on
     the form, so reading its absence from the payload as a deletion would delete
     an admin's curated-intake row on the first save of an unrelated field. */
  it("never removes a free-text row", () => {
    const rows = [service(), service({ id: "row2", catalogue_id: null, label: "Fractional CTO" })];
    const plan = planServices(rows, [], catalogue);

    expect(plan.remove).toEqual(["row1"]);
  });

  /* A label with no catalogue entry cannot be written as a catalogue row, and
     the form cannot produce one — `Service` is the closed union. Dropped rather
     than sent as a free-text label, because a self-service row that is not a
     catalogue reference is a filter chip nobody can filter on, which is what
     `service_catalogue` exists to prevent. */
  it("drops a label the catalogue does not name", () => {
    const plan = planServices([], ["Fractional CTO"] as unknown as Service[], catalogue);

    expect(plan.insert).toEqual([]);
  });

  /* The case the first version of this file missed, because its only free-text
     fixture was "Fractional CTO" — a label outside the vocabulary, which is the
     half that already worked. A labelled row saying a vocabulary word renders as
     that chip, so matching on catalogue ids left the chip looking unsatisfied
     and inserted a second row beside it: one visible service, two of the three
     slots under `practitioner_services_cap` gone, and the third refused by a
     trigger over a row the practitioner could not see. */
  it("does not add a catalogue row beside a free-text row saying the same thing", () => {
    const rows = [service({ id: "row2", catalogue_id: null, label: "Code review" })];
    const plan = planServices(rows, ["Code review"] as Service[], catalogue);

    expect(plan).toEqual({ insert: [], remove: [] });
  });

  /* The other half of the same rule: this function only deletes what the form
     could have shown. A catalogue label renamed out from under the union in
     `@/lib/practitioners` is dropped from the draft by the read, and matching on
     absence alone would then delete it from every profile that offered it, one
     save at a time and silently. `tests/db/catalogues.test.ts` would fail the
     rename in CI; failing closed here costs one condition and does not depend on
     another suite running. */
  it("keeps a catalogue row whose label has drifted out of the vocabulary", () => {
    const renamed = [{ id: "s1", label: "Code review, renamed" }, ...catalogue.slice(1)];
    const plan = planServices([service()], [], renamed);

    expect(plan.remove).toEqual([]);
  });

  /* And a catalogue reference the catalogue does not name at all — a row
     pointing at an entry this read did not return. Kept for the same reason:
     nothing on the form showed it, so its absence from the payload says
     nothing about what the practitioner meant. */
  it("keeps a catalogue row the catalogue does not name", () => {
    const plan = planServices([service({ catalogue_id: "unknown" })], [], catalogue);

    expect(plan.remove).toEqual([]);
  });
});
