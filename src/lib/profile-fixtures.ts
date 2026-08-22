import type { CatalogueEntry, CredentialKind } from "@/lib/practitioners";
import seeded from "../../supabase/seed/credential-catalogue.json";

/**
 * The credential catalogue, as a fixture for the unit tests over
 * `@/lib/profile-draft`.
 *
 * **This was the persistence seam and is no longer one.** #71 built the editor
 * against three fixtures here; #14 replaced two of them with the practitioner's
 * own rows — `readOwnProfile` in `src/app/profile/_lib/profile-read.ts` — and
 * the page reads the catalogue itself through `listCredentialCatalogue` in
 * `@/lib/directory`, which is the same `anon` read the public profile page
 * makes. `exampleDraft()` and `exampleControlled()` went with the seam.
 *
 * What is left is a catalogue that needs no stack, which is what lets
 * `profile-draft.test.ts` assert the derivations over realistic entries. It is
 * read from the canonical record rather than restated, so a test cannot pass
 * against a catalogue that does not exist.
 *
 * It reads `supabase/seed/credential-catalogue.json` rather than restating the
 * entries, because that file is the canonical record of the 24 confirmed Claude
 * credentials and a second copy is a second thing to be wrong. The alternative
 * — inventing plausible course names — is what the prototype's catalogue did,
 * under a header forbidding anyone to copy them anywhere, on a page whose whole
 * job is credibility.
 *
 * One thing it does not have, and it arrives with the query: **ids**. The column
 * is a `uuid` the database generates and the JSON carries none, so the ids below
 * are derived from the index and are uuid-shaped on purpose — a short stand-in
 * hides anything that truncates one.
 *
 * It used to be missing `kind` and `platform` too, flattening them into the
 * single `source` that `@/lib/practitioners` still carried. #53 reconciled that
 * type with the column pair, so the mapping below is straight through and no
 * longer lossy about a certification's platform.
 */

/**
 * `sort_order` restarts at 0 per platform in the seed — it is what a grouped
 * picker renders against, and the unique constraint does not span it. A single
 * list needs one key, so the group's own offset is folded in here and the
 * picker sorts on one number rather than sorting twice. Courses first, as the
 * seed writes them: it is the track somebody works through.
 */
const groupOffset: Record<CredentialKind, number> = {
  course: 0,
  certification: 1000,
};

const entries: CatalogueEntry[] = seeded.map((entry, index) => {
  /* Throws rather than falling back. `check (kind in ('certification',
     'course'))` already refuses anything else at the database, so a fallback
     would be defending against a state the schema forbids by inventing an
     answer — and the answer it invented would file a certification under the
     Academy, which is the one distinction the `<optgroup>`s exist to show.

     The public mapper in `@/lib/directory-mapping` deliberately does the
     opposite and reads an unknown kind as a course. The difference is who is
     reading: a wrong kind here is a bug in a file somebody just edited, and a
     wrong kind there is a row the database already accepted on a page whose
     visitors should not get a 500 over it. */
  if (entry.kind !== "certification" && entry.kind !== "course") {
    throw new Error(`Unknown credential kind ${entry.kind}`);
  }
  const kind: CredentialKind = entry.kind;

  return {
    /* Deterministic, so a reload does not repoint a credential. */
    id: `c0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind,
    platform: entry.platform,
    label: entry.label,
    courseUrl: entry.courseUrl,
    /* `active` takes its default for all 24 rows in the seed: retirement is a
       flag flip, never a delete. Nothing in the record is retired yet. */
    active: true,
    sortOrder: groupOffset[kind] + entry.sortOrder,
  };
});

export function credentialCatalogue(): CatalogueEntry[] {
  return entries;
}
