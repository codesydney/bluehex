import { isService, type Service } from "@/lib/practitioners";
import type { ProfileWrite } from "@/lib/profile-draft";

/**
 * What a save has to do to the two child tables, worked out before anything is
 * sent. **The pure half of the write**, and it exists as its own module for the
 * same reason `./profile-mapping` does: every rule below is a rule about the
 * schema, and none of it needs a stack to assert.
 *
 * The editor submits a whole profile rather than a diff — it is a form, and the
 * draft is the state the practitioner means to be true when they press the
 * button. `practitioner_credentials` and `practitioner_services` are rows, so
 * "make the table say this" is an insert, an update and a delete, and which row
 * goes in which pile is decided here.
 *
 * ## Why a credential is keyed on `catalogue_id` and not on its own id
 *
 * `unique (practitioner_id, catalogue_id)` is what makes that a key: a
 * practitioner holds a given credential once or not at all. Keying on the row
 * id instead would mean repicking the credential in an existing row reads as an
 * edit, which is right, *and* that adding the entry it was changed to reads as
 * an insert of a row that already exists, which is a `23505` the practitioner
 * cannot act on. Keyed on the catalogue entry, the same two edits are a delete
 * and an insert, and they commute.
 *
 * ## Why an unchanged row is left alone
 *
 * `credentials_guard()` clears `verified` when `catalogue_id`, `earned_at` or
 * `evidence_url` changes, and it compares with `is distinct from` — so a `PATCH`
 * that rewrites the same values does not clear a check. Skipping it anyway is
 * not defensive: `updated_at` is in the `authenticated` select grant and is
 * served to the owner, and a timestamp that moves every time somebody presses
 * Save on an untouched credential is a timestamp that answers "when did this
 * last change" wrongly.
 *
 * `evidence_public` is in the comparison here although it is not in the
 * trigger's clearing list. The two lists answer different questions — "has
 * anything changed" against "has the *claim* changed" — and conflating them
 * would drop a real edit to the opt-in on the floor.
 */

export type CredentialWrite = ProfileWrite["credentials"][number];

/** The saved rows, as `my_credentials()` returns them. `verified` is absent on
    purpose: nothing in a plan may depend on it, because a practitioner does not
    write it and a plan that read it would be one edit away from encoding a rule
    about Bluehex's attestation into the practitioner's own save. */
export type SavedCredential = {
  id: string;
  catalogue_id: string;
  earned_at: string;
  evidence_url: string | null;
  evidence_public: boolean;
};

export type CredentialPlan = {
  insert: CredentialWrite[];
  update: { id: string; row: CredentialWrite }[];
  remove: string[];
};

export function planCredentials(
  saved: SavedCredential[],
  wanted: CredentialWrite[],
): CredentialPlan {
  const byCatalogue = new Map(saved.map((row) => [row.catalogue_id, row]));
  const plan: CredentialPlan = { insert: [], update: [], remove: [] };

  /* Deduplicated on the way in. The picker disables an entry already on the
     profile, so two rows naming one credential are not reachable through the
     form — but the payload arrives from a browser, and `unique (practitioner_id,
     catalogue_id)` would refuse the pair with a `23505` naming a constraint
     rather than a mistake. The first wins, which is the one nearer the top of
     the form. */
  const seen = new Set<string>();

  for (const row of wanted) {
    if (seen.has(row.catalogue_id)) continue;
    seen.add(row.catalogue_id);

    const existing = byCatalogue.get(row.catalogue_id);
    if (!existing) {
      plan.insert.push(row);
      continue;
    }

    if (changed(existing, row)) plan.update.push({ id: existing.id, row });
  }

  for (const row of saved) {
    if (!seen.has(row.catalogue_id)) plan.remove.push(row.id);
  }

  return plan;
}

function changed(saved: SavedCredential, wanted: CredentialWrite): boolean {
  return (
    saved.earned_at !== wanted.earned_at ||
    saved.evidence_url !== wanted.evidence_url ||
    saved.evidence_public !== wanted.evidence_public
  );
}

/** A saved service row, from `practitioner_services`. Exactly one of the two
    columns is set — `practitioner_services_one_kind` — so the row's label is
    either the catalogue entry's or its own. */
export type SavedService = {
  id: string;
  catalogue_id: string | null;
  label: string | null;
};

/** `service_catalogue`, as the write reads it. Both directions are needed: a
    saved row resolves id to label, and a chip resolves label to id. */
export type ServiceCatalogueEntry = { id: string; label: string };

export type ServicePlan = {
  /** `service_catalogue` ids. Every service the form offers is a catalogue
      entry, so nothing here ever carries a `label` — that column is for the
      rows an admin wrote during curated intake. */
  insert: string[];
  /** Row ids, not catalogue ids: the delete names the rows it removes, so a
      labelled row can never be caught by a filter meant for a catalogue one. */
  remove: string[];
};

/**
 * Services reconcile by label, and there is nothing to update: a row carries a
 * reference and no other writable content, so an edit is a different row.
 *
 * **By label rather than by catalogue id, which is the correction #125 made.**
 * The read renders a row's label whether it came from the catalogue or from the
 * row's own `label` column, so a free-text row saying "Code review" *is* the
 * Code review chip on screen. Matched on ids, that chip looked unsatisfied and
 * every save inserted a second row beside it — one visible service occupying
 * two of the three slots `practitioner_services_cap` allows, and the third
 * refused by a trigger over a row the practitioner could not see.
 *
 * **Two kinds of row are never removed, and both are the same rule: this
 * function only deletes what the form could have shown.**
 *
 *   - **A free-text row**, as before. It was written by an admin during curated
 *     intake and has no control on this form, so reading its absence from the
 *     payload as a deletion would delete it on the first save of an unrelated
 *     field.
 *   - **A catalogue row whose label is not in the closed vocabulary.** That is
 *     a label an admin renamed out from under the union in
 *     `@/lib/practitioners`: the read drops it from the draft, because no chip
 *     can render it, and matching on absence alone would then delete it from
 *     every profile offering it, one save at a time, silently.
 *     `tests/db/catalogues.test.ts` holds the table to that list so a rename
 *     fails CI — but a test in another suite is not a mechanism, and failing
 *     closed here costs one condition.
 */
export function planServices(
  saved: SavedService[],
  wanted: Service[],
  catalogue: ServiceCatalogueEntry[],
): ServicePlan {
  const labelById = new Map(catalogue.map((entry) => [entry.id, entry.label]));
  const idByLabel = new Map(catalogue.map((entry) => [entry.label, entry.id]));

  /* What a saved row shows on the form, or `null` where it shows nothing — a
     catalogue reference the catalogue does not name. Not the same as a row
     whose label is merely outside the vocabulary, which resolves fine and is
     then held back by `isService` below. */
  const shownLabel = (row: SavedService): string | null =>
    row.catalogue_id === null ? row.label : (labelById.get(row.catalogue_id) ?? null);

  const wantedLabels = new Set<string>(wanted);
  const covered = new Set(
    saved.map(shownLabel).filter((label): label is string => label !== null),
  );

  return {
    insert: wanted
      .filter((label) => !covered.has(label))
      .map((label) => idByLabel.get(label))
      .filter((id): id is string => id !== undefined),
    remove: saved
      .filter((row) => {
        if (row.catalogue_id === null) return false;

        const label = shownLabel(row);
        return label !== null && isService(label) && !wantedLabels.has(label);
      })
      .map((row) => row.id),
  };
}
