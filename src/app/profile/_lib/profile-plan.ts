import type { Service } from "@/lib/practitioners";
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

/** A saved service row, from `practitioner_services`. */
export type SavedService = {
  id: string;
  catalogue_id: string | null;
  label: string | null;
};

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
 * Services reconcile by catalogue id, and there is nothing to update: a row
 * carries a reference and no other writable content, so an edit is a different
 * row.
 *
 * **A free-text row is left alone rather than removed**, and that is the whole
 * of what keeps this save non-destructive about content it cannot see. The
 * chips render the closed vocabulary; a labelled row was written by an admin
 * during curated intake and has no control on this form, so treating its
 * absence from the payload as a deletion would delete it on the first save of
 * an unrelated field. It costs the practitioner nothing, because it also counts
 * against `practitioner_services_cap` — which is the one visible consequence,
 * and it is the trigger's message rather than a silent narrowing.
 */
export function planServices(
  saved: SavedService[],
  wanted: Service[],
  catalogue: Map<string, string>,
): ServicePlan {
  const wantedIds = new Set(
    wanted.map((label) => catalogue.get(label)).filter((id): id is string => id !== undefined),
  );
  const savedIds = new Set(
    saved.map((row) => row.catalogue_id).filter((id): id is string => id !== null),
  );

  return {
    insert: [...wantedIds].filter((id) => !savedIds.has(id)),
    remove: saved
      .filter((row) => row.catalogue_id !== null && !wantedIds.has(row.catalogue_id))
      .map((row) => row.id),
  };
}
