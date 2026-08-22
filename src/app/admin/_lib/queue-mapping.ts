/**
 * Rows to view model, for the review queue. Pure, so it can be tested without a
 * database.
 *
 * The half of the admin read that has no network in it: `./queue-read` names
 * the columns and makes the request, and everything below turns what comes back
 * into the shapes in `./queue`. It is the same split `@/lib/directory` and
 * `@/lib/directory-mapping` make on the public side, for the same reason — the
 * ordering rules and the null handling are asserted in `pnpm test` rather than
 * only against a running stack.
 *
 * **This side reads columns the public side cannot.** `evidence_url` rather than
 * `evidence_url_public`, `status`, `user_id`, `verified_at` and `verified_by`
 * are all `bluehex_admin` grants, and the queue exists to show them. What that
 * means for anything imported from here is that it must never reach a public
 * page — nothing in `src/lib` imports this file, and nothing should.
 *
 * **Nothing here invents a value.** A column that is null stays null; a profile
 * with no headline is shown as having none, because judging a submission means
 * reading what was written, absences included.
 */

import type { CatalogueEntry, ProfileStatus, QueueCredential, QueueProfile } from "./queue";

/* The row shapes as PostgREST returns them for the select in `./queue-read`.
   Written by hand rather than derived from `Database`, because the generated
   types describe whole tables and these describe one projection — the same
   reasoning `@/lib/directory-mapping` records at more length.

   Wider than what the query actually returns on the embeds: a collection is
   `T[] | null` and an embedded row is `T | null`, where the parser infers
   non-null from the foreign keys. The wider direction is safe — the narrower
   real value is assignable — and it is what lets the mapper state what it does
   with an absent embed rather than assume one cannot happen. */

export type QueueCatalogueRow = {
  id: string;
  kind: string;
  platform: string;
  label: string;
  sort_order: number;
};

export type QueueCredentialRow = {
  id: string;
  earned_at: string;
  evidence_url: string | null;
  evidence_public: boolean;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  credential_catalogue: QueueCatalogueRow | null;
};

export type QueueServiceRow = {
  label: string | null;
  service_catalogue: { label: string; sort_order: number } | null;
};

export type QueueProfileRow = {
  id: string;
  name: string;
  headline: string | null;
  location: string | null;
  bio: string | null;
  focus: string[] | null;
  status: ProfileStatus;
  user_id: string | null;
  updated_at: string;
  practitioner_contacts: { contact_email: string } | null;
  practitioner_review_notes: { note: string } | null;
  practitioner_credentials: QueueCredentialRow[] | null;
  practitioner_services: QueueServiceRow[] | null;
};

/**
 * Who is reading the queue, for the one field that needs to know.
 *
 * `label` is what the reviewer is called on screen — their email, or their id
 * when the token carries no address.
 */
export type QueueViewer = { id: string; label: string };

/**
 * A `verified_by` uuid as something a human can read.
 *
 * **The badge means a named human looked, and this is the closest the admin
 * screen can currently get to naming them.** Nothing reachable from PostgREST
 * turns a uuid into a person: `auth` is not an exposed schema, and
 * `public.admins` deliberately carries no grant to `bluehex_admin` at all, so
 * an admin cannot even read the list they are on. Resolving the name properly
 * wants a `security definer` function or a column on `admins` — a migration,
 * and therefore not this ticket's to write. Recorded on the pull request.
 *
 * So: your own check is yours by name, somebody else's is attributed but not
 * named, and a row recording nobody says so rather than printing `null` at a
 * reviewer. The third is reachable today — `verified_by` is `on delete set
 * null`, and every seeded verified row has it null because no account existed
 * to write.
 */
function reviewerName(verifiedBy: string | null, viewer: QueueViewer): string | null {
  if (!verifiedBy) return null;
  return verifiedBy === viewer.id ? viewer.label : "another Bluehex admin";
}

function toCatalogueEntry(row: QueueCatalogueRow): CatalogueEntry {
  return {
    id: row.id,
    /* Falling *down* rather than up, exactly as the public mapper does: an
       unrecognised `kind` is described as a course, so the failure mode is a
       certification read as a course and never the reverse. */
    kind: row.kind === "certification" ? "certification" : "course",
    platform: row.platform,
    label: row.label,
  };
}

/**
 * Held credentials, certifications first and then in catalogue order.
 *
 * Sorted here rather than in the query, because the key is a column of the
 * *embedded* table. The rule is `byCatalogueOrder` from `@/lib/practitioners`
 * restated over this file's narrower `CatalogueEntry` — that one carries
 * `active`, `courseUrl` and `sortOrder`, none of which a review screen has any
 * use for, and widening the queue's model to reuse one comparator would be the
 * tail wagging the dog. `sort_order` is selected for this and for nothing else.
 *
 * A credential whose catalogue row did not come back is dropped rather than
 * rendered without a label. `catalogue_id` is `not null` with `on delete
 * restrict`, so the state cannot arise from the data — only from a query that
 * forgot the embed — and a label-less credential is the free text the catalogue
 * exists to prevent, arriving on the one screen where it would be believed.
 */
function toCredentials(
  rows: QueueCredentialRow[] | null,
  viewer: QueueViewer,
): QueueCredential[] {
  return (rows ?? [])
    .filter(
      (row): row is QueueCredentialRow & { credential_catalogue: QueueCatalogueRow } =>
        Boolean(row.credential_catalogue),
    )
    /* Sorted as rows rather than after mapping, because `sort_order` is a
       property of the catalogue entry and not of anything a credential carries
       — `CatalogueEntry` here holds the four fields a review screen reads and
       nothing else. */
    .sort(
      (left, right) =>
        Number(right.credential_catalogue.kind === "certification") -
          Number(left.credential_catalogue.kind === "certification") ||
        left.credential_catalogue.sort_order - right.credential_catalogue.sort_order ||
        left.credential_catalogue.label.localeCompare(right.credential_catalogue.label),
    )
    .map((row) => ({
      id: row.id,
      entry: toCatalogueEntry(row.credential_catalogue),
      earnedAt: row.earned_at,
      /* `evidence_url`, not `evidence_url_public`. The masked column is what
         `anon` is granted and is null whenever the practitioner opted out; the
         reviewer holds the real one and it is the whole of what they judge. */
      evidenceUrl: row.evidence_url,
      evidencePublic: row.evidence_public,
      verified: row.verified,
      verifiedAt: row.verified_at,
      verifiedBy: reviewerName(row.verified_by, viewer),
    }));
}

/**
 * What a profile offers, as labels — catalogue services first, custom after.
 *
 * The two kinds are told apart by which column is populated;
 * `practitioner_services_one_kind` refuses a row naming both or neither, so
 * exactly one of them answers. The order matches the public profile's, so an
 * admin reads the roster's vocabulary in the roster's order rather than in
 * insertion order.
 */
function toServiceLabels(rows: QueueServiceRow[] | null): string[] {
  const catalogued = (rows ?? [])
    .map((row) => row.service_catalogue)
    .filter((entry): entry is NonNullable<QueueServiceRow["service_catalogue"]> => Boolean(entry))
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label))
    .map((entry) => entry.label);

  const custom = (rows ?? [])
    .filter((row) => !row.service_catalogue && row.label)
    .map((row) => row.label as string)
    .sort((left, right) => left.localeCompare(right));

  return [...catalogued, ...custom];
}

/**
 * The latest check across a profile's credentials, or null.
 *
 * **Derived from the live rows, and therefore not monotonic** — undoing a check
 * nulls that row's `verified_at` and the maximum can fall back to an older one.
 * `hasDrifted` reads this against `updated_at`, so a profile edited between the
 * two checks then reads as drifted. That is a real statement rather than a
 * phantom: the check that covered the edit has been taken back. Making it
 * monotonic needs somewhere to remember a check that no longer exists, which is
 * a column, and a column is a schema decision rather than a mapping one.
 */
function lastVerifiedAt(credentials: QueueCredential[]): string | null {
  const stamps = credentials
    .map((credential) => credential.verifiedAt)
    .filter((stamp): stamp is string => Boolean(stamp));

  return stamps.length > 0 ? stamps.reduce((a, b) => (a > b ? a : b)) : null;
}

/**
 * One row of `practitioners`, with its children, as the queue sees it.
 *
 * `contactEmail` comes off the embedded contact row and could come from nowhere
 * else: the address deliberately does not live on the profile, so that no later
 * `grant select on practitioners to anon` can publish it. See
 * `docs/adr/0002-links-are-published-addresses-are-not.md`.
 *
 * `owner` is `user_id` — an account id rather than a name, because there is
 * nothing to resolve it against (see `reviewerName`). The screen only asks
 * whether it is null, which is what tells an unclaimed profile from a claimed
 * one.
 */
export function toQueueProfile(row: QueueProfileRow, viewer: QueueViewer): QueueProfile {
  const credentials = toCredentials(row.practitioner_credentials, viewer);

  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    location: row.location,
    bio: row.bio,
    focus: row.focus ?? [],
    services: toServiceLabels(row.practitioner_services),
    /* `contact_id` is `not null unique`, so the embed always resolves and the
       fallback is unreachable. It is here because the row type is deliberately
       wider than the query — narrowing it away is the alternative, and that
       would be the mapper asserting a foreign key rather than reading one. */
    contactEmail: row.practitioner_contacts?.contact_email ?? "",
    status: row.status,
    owner: row.user_id,
    updatedAt: row.updated_at,
    lastVerifiedAt: lastVerifiedAt(credentials),
    reviewNote: row.practitioner_review_notes?.note ?? null,
    credentials,
  };
}
