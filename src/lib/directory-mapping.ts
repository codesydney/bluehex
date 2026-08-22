/**
 * Rows to view model. Pure, so it can be tested without a database.
 *
 * The half of the read that has no network in it: `@/lib/directory` names the
 * columns and makes the request, and everything below turns what comes back
 * into the shapes in `@/lib/practitioners`. Splitting them is what lets the
 * ordering rules and the null handling be asserted in `pnpm test` rather than
 * only in `pnpm test:db`.
 *
 * **Nothing here invents a value.** Every field maps from a column `anon` is
 * granted, and a column that is null stays null — a profile with no headline
 * renders without one rather than with a placeholder. The one exception is the
 * `?? []` on an embedded collection, which is PostgREST's absent-array rather
 * than a substituted value.
 */

import type {
  CatalogueEntry,
  Credential,
  Profile,
  ServiceOption,
} from "@/lib/practitioners";

/* The row shapes as PostgREST returns them for the selects in `@/lib/directory`.
   Written by hand rather than derived from `Database` in `database.types.ts`,
   because the generated types describe the whole table and these describe one
   projection of it — the point of naming every column is that the query reads
   fewer of them than exist, and a type saying otherwise would defeat it. They
   are structurally checked against the generated row types in
   `directory-mapping.test.ts`, so a column that changes shape still fails. */

export type CatalogueRow = {
  id: string;
  kind: string;
  platform: string;
  label: string;
  course_url: string | null;
  active: boolean;
  sort_order: number;
};

export type CredentialRow = {
  id: string;
  catalogue_id: string;
  earned_at: string;
  verified: boolean;
  evidence_url_public: string | null;
  credential_catalogue: CatalogueRow | null;
};

export type ServiceRow = {
  id: string;
  catalogue_id: string | null;
  label: string | null;
  service_catalogue: { id: string; label: string; active: boolean; sort_order: number } | null;
};

export type ProfileRow = {
  id: string;
  name: string;
  headline: string | null;
  location: string | null;
  country_code: string | null;
  bio: string | null;
  focus: string[];
  availability: string | null;
  website_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  booking_url: string | null;
  practitioner_credentials: CredentialRow[] | null;
  practitioner_services: ServiceRow[] | null;
};

export type ServiceCatalogueRow = { id: string; label: string; active: boolean; sort_order: number };

/**
 * `kind` is `text` with a `check (kind in ('certification', 'course'))` behind
 * it, so the generated type is `string` and the narrowing has to happen
 * somewhere. It happens here, and it does not throw: an unrecognised kind is
 * read as a course.
 *
 * That is the opposite of what `profile-fixtures.ts` does, and deliberately.
 * The fixture throws because a wrong kind there is a bug in a file somebody
 * just edited; this is a public page rendering a row the database already
 * accepted, and a 500 on the whole directory is a worse answer than one
 * credential whose weight reads low. Falling *down* rather than up is the safe
 * direction: the failure mode is a certification described as a course, never a
 * course described as a certification.
 */
export function toCatalogueEntry(row: CatalogueRow): CatalogueEntry {
  return {
    id: row.id,
    kind: row.kind === "certification" ? "certification" : "course",
    platform: row.platform,
    label: row.label,
    courseUrl: row.course_url,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

/**
 * Held credentials, in catalogue order.
 *
 * Sorted here rather than in the query, because the key is a column of the
 * *embedded* table and ordering an embed by its own embed is a PostgREST
 * incantation nobody reading this file could check. It is also the same rule
 * the profile page already applies to the unearned half, so the two halves of
 * that list cannot disagree about what order the catalogue is in.
 *
 * `sort_order` restarts at zero per platform in the seed, so `kind` breaks the
 * tie first — courses then certifications, which is the order somebody works
 * through them — and the label breaks it after that, so the list is stable
 * rather than merely sorted.
 *
 * A credential whose catalogue row did not come back is dropped rather than
 * rendered without a label. `catalogue_id` is `not null` with
 * `on delete restrict`, so the state cannot arise from the data; it can only
 * arise from a query that forgot the embed, and a silently label-less
 * credential is exactly the free text the catalogue exists to prevent.
 */
export function toCredentials(rows: CredentialRow[] | null): Credential[] {
  return (rows ?? [])
    .filter((row): row is CredentialRow & { credential_catalogue: CatalogueRow } =>
      Boolean(row.credential_catalogue),
    )
    .map((row) => ({
      entry: toCatalogueEntry(row.credential_catalogue),
      earnedAt: row.earned_at,
      verified: row.verified,
      evidenceUrl: row.evidence_url_public,
    }))
    .sort(
      (left, right) =>
        Number(left.entry.kind === "certification") -
          Number(right.entry.kind === "certification") ||
        left.entry.sortOrder - right.entry.sortOrder ||
        left.entry.label.localeCompare(right.entry.label),
    );
}

/**
 * What a profile offers, as labels.
 *
 * Two kinds of row arrive and they are told apart by which column is populated —
 * `practitioner_services_one_kind` refuses a row naming both or neither, so
 * exactly one of them answers. A catalogue service takes its label from
 * `service_catalogue`, which is what makes a promotion rename every profile at
 * once; a custom service carries its own and can never become a chip.
 *
 * Catalogue services sort first, in catalogue order, and custom ones follow
 * alphabetically. The reason is the reader rather than tidiness: the chips
 * above the roster are in catalogue order, so a row whose services came back in
 * insertion order would read as a different vocabulary from the filters
 * directly above it.
 */
export function toServiceLabels(rows: ServiceRow[] | null): string[] {
  const catalogued = (rows ?? [])
    .filter((row) => row.service_catalogue)
    .map((row) => row.service_catalogue as NonNullable<ServiceRow["service_catalogue"]>)
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label))
    .map((entry) => entry.label);

  const custom = (rows ?? [])
    .filter((row) => !row.service_catalogue && row.label)
    .map((row) => row.label as string)
    .sort((left, right) => left.localeCompare(right));

  return [...catalogued, ...custom];
}

/**
 * One row of `practitioners`, with its children, as the public record.
 *
 * `status`, `user_id`, `approved_by` and the raw `evidence_url` have no field
 * to land in, which is the structural half of "they never reach the browser" —
 * the query not naming them is the other half, and either alone would be a
 * rule somebody has to remember.
 *
 * `availability` and the four link columns *do* land here. They are in the
 * `anon` grant and in the model; only `bookingUrl` is drawn today, and drawing
 * the rest is #84 and #85 rather than an oversight.
 */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    location: row.location,
    countryCode: row.country_code,
    bio: row.bio,
    focus: row.focus ?? [],
    services: toServiceLabels(row.practitioner_services),
    availability: row.availability,
    websiteUrl: row.website_url,
    githubUrl: row.github_url,
    linkedinUrl: row.linkedin_url,
    bookingUrl: row.booking_url,
    credentials: toCredentials(row.practitioner_credentials),
  };
}

/**
 * The chip vocabulary, in catalogue order.
 *
 * Retired entries are dropped: `active` is how a service leaves the vocabulary
 * without deleting the rows that reference it, and a chip for something Bluehex
 * has stopped naming would filter on a word it no longer uses. A profile still
 * carrying it keeps rendering the label — the label comes from the row, not
 * from this list.
 */
export function toServiceOptions(rows: ServiceCatalogueRow[]): ServiceOption[] {
  return rows
    .filter((row) => row.active)
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label))
    .map((row) => ({ id: row.id, label: row.label, sortOrder: row.sort_order }));
}
