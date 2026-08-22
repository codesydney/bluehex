/**
 * The first queries this repository makes.
 *
 * Everything public the site renders comes from here: the directory listing,
 * one profile, the two catalogues. It is an **anonymous** read through
 * `@/lib/supabase/anon` — the publishable key and nothing else — so every row
 * that comes back is a row row level security decided a visitor may see.
 *
 * ## Three things that fail in confusing ways
 *
 * **`select *` is refused.** Reads are column-scoped: `anon` holds `select` on
 * a named list and not on the table, so a star returns `42501 permission
 * denied` before any policy is consulted. Every column is named below, and a
 * column added to the schema later is invisible here until it is named too —
 * which fails closed, and is the right way round.
 *
 * **`status` is not one of those columns, so nothing filters on it.** The
 * instinct is `.eq("status", "approved")` and it does not return nothing, it
 * *errors* — the privilege is missing, not the rows. `practitioners_read_approved`
 * is the filter, and it is a policy rather than a predicate: `anon` sees
 * approved profiles and no others, and their credentials and services follow
 * their parent through `profile_is_approved()`. The listing below therefore has
 * no `where` clause at all, which looks wrong and is exactly right.
 *
 * **A credential carries no label.** It references `credential_catalogue`
 * through `catalogue_id` and the label comes from the embed. That indirection is
 * the whole of "a practitioner cannot type a credential name", so its absence
 * from the credential row is the feature rather than an omission.
 *
 * ## What happens when Supabase is not configured
 *
 * Every read below answers empty rather than throwing, and only when both
 * environment variables are *absent*. That is the degradation `next build` needs
 * on a clean clone and in CI, where the `Quality` check builds with no Supabase
 * at all: the directory prerenders as the invitation card it shipped with, which
 * is a page that is honestly empty rather than a build that fails.
 *
 * **A configured deployment whose query fails still throws**, and the asymmetry
 * is the point. Swallowing an error there would render an empty directory that
 * is indistinguishable from a true one — the silent, fails-open shape
 * `AGENTS.md` warns about. Failing the render instead means a broken database
 * fails the build and the previous deployment keeps serving, which is the
 * failure everybody would choose.
 */

import { cache } from "react";
import type {
  CatalogueEntry,
  Profile,
  ServiceOption,
} from "@/lib/practitioners";
import { getClient } from "@/lib/supabase/anon";
import { supabaseEnvOrNull } from "@/lib/supabase/env";
import {
  toCatalogueEntry,
  toProfile,
  toServiceOptions,
  type CatalogueRow,
  type ProfileRow,
  type ServiceCatalogueRow,
} from "@/lib/directory-mapping";

/* The `anon` grant on `practitioners`, in full. `availability` and the four
   links are read and carried into the model; only `bookingUrl` is drawn today,
   and drawing the rest is #84 and #85. Reading a column the page does not render
   costs one field in a payload and keeps the model and the grant the same list;
   naming a subset would make the next person diff two lists to find out why. */
const PROFILE_COLUMNS =
  "id,name,headline,location,country_code,bio,focus,availability," +
  "website_url,github_url,linkedin_url,booking_url";

/* `evidence_url` is deliberately not here and could not be: `anon` has no grant
   on it. `evidence_url_public` is the generated column that is null unless the
   practitioner set `evidence_public`, which is what makes the masking a
   privilege rather than a rule the query has to remember. */
const CREDENTIAL_COLUMNS =
  "practitioner_credentials(id,catalogue_id,earned_at,verified,evidence_url_public," +
  "credential_catalogue(id,kind,platform,label,course_url,active,sort_order))";

const SERVICE_COLUMNS =
  "practitioner_services(id,catalogue_id,label," +
  "service_catalogue(id,label,active,sort_order))";

const CATALOGUE_COLUMNS = "id,kind,platform,label,course_url,active,sort_order";

const PROFILE_SELECT = `${PROFILE_COLUMNS},${CREDENTIAL_COLUMNS},${SERVICE_COLUMNS}`;

/** Whether Supabase is configured at all. See the header: absent is degraded,
    present but broken is an error. */
function configured() {
  return supabaseEnvOrNull() !== null;
}

/**
 * The whole published directory, in name order.
 *
 * No pagination and no `limit`, because the roster filters in the browser: the
 * client component holds search and filters as local state and matches against
 * the set it was handed, which is what makes the badge rollup free. This is the
 * seam to move behind a route handler when the list outgrows one payload; the
 * component's props do not change when it does.
 *
 * Ordered by name so two renders of the same data produce the same page. Row
 * order from Postgres is otherwise whatever the plan happens to produce, and a
 * cached page that reshuffles on every regeneration is a diff nobody can read.
 *
 * `cache` is React's per-request memo, not a Next.js cache: it stops one render
 * making the same request twice. The caching that spans requests is the route
 * segment's, configured on the pages.
 */
export const listProfiles = cache(async (): Promise<Profile[]> => {
  if (!configured()) return [];

  const { data, error } = await getClient()
    .from("practitioners")
    .select(PROFILE_SELECT)
    .order("name");

  if (error) throw new Error(`Reading the practitioner directory failed: ${error.message}`);

  return (data as unknown as ProfileRow[]).map(toProfile);
});

/**
 * The ids of every published profile, and nothing else.
 *
 * `/p/<handle>` resolves on the first six characters of a uuid, so a handle
 * cannot be turned into a `where` clause — Postgres has no prefix match on
 * `uuid` and casting one per row to compare it would be a sequential scan
 * wearing a filter. Reading the ids and matching in memory is honest about that,
 * and it is one narrow column.
 *
 * It doubles as the existence check. A profile that left `approved` is not in
 * this list, because RLS is what builds it, so a withdrawn handle 404s rather
 * than resolving to a row the next query would refuse.
 */
export const listProfileIds = cache(async (): Promise<string[]> => {
  if (!configured()) return [];

  /* Ordered, so a collision on the six-character short id resolves to the same
     profile every time. It still resolves to the *wrong* one — see
     `src/app/p/_lib/handles.ts` — but a cached page that served a different
     person on each regeneration would be worse than one that is consistently
     wrong, and harder to recognise as the collision it is. */
  const { data, error } = await getClient().from("practitioners").select("id").order("id");

  if (error) throw new Error(`Reading practitioner ids failed: ${error.message}`);

  return data.map((row) => row.id);
});

/* A row id arrives from a URL on the contact page, so it is untrusted text.
   Postgres answers `22P02 invalid input syntax for type uuid` on anything that
   is not one, which `getProfile` would raise as an error — a 500 on a page whose
   correct response to an unknown id is simply no banner. Shape-checking first
   turns that into the `null` the caller already handles. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One published profile by id, or null.
 *
 * Null covers three states the caller does not need to tell apart: no such row,
 * a row row level security will not show this visitor, and an id that is not a
 * uuid. All three mean the same thing to a page — there is nothing here.
 */
export const getProfile = cache(async (id: string): Promise<Profile | null> => {
  if (!configured() || !UUID.test(id)) return null;

  const { data, error } = await getClient()
    .from("practitioners")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Reading a practitioner profile failed: ${error.message}`);

  return data ? toProfile(data as unknown as ProfileRow) : null;
});

/**
 * Every credential that exists — Bluehex's reference data, not anybody's record.
 *
 * The profile page holds what somebody earned against this, so the *Not earned*
 * control has something to reveal. Retired entries are read rather than filtered
 * out: `active` is applied where the list is used, because a retired entry
 * somebody holds still renders and a retired entry nobody holds is not something
 * they failed to do.
 */
export const listCredentialCatalogue = cache(async (): Promise<CatalogueEntry[]> => {
  if (!configured()) return [];

  const { data, error } = await getClient()
    .from("credential_catalogue")
    .select(CATALOGUE_COLUMNS)
    .order("kind")
    .order("sort_order");

  if (error) throw new Error(`Reading the credential catalogue failed: ${error.message}`);

  return (data as CatalogueRow[]).map(toCatalogueEntry);
});

/**
 * The service vocabulary the roster's filter chips are drawn from.
 *
 * `service_catalogue` rather than the `services` array in `@/lib/practitioners`,
 * which is now the editor's vocabulary and the list the table was seeded from.
 * The distinction is what makes promotion work: Bluehex moves a recurring custom
 * service into this table and it starts filtering, with no deploy.
 */
export const listServiceOptions = cache(async (): Promise<ServiceOption[]> => {
  if (!configured()) return [];

  const { data, error } = await getClient()
    .from("service_catalogue")
    .select("id,label,active,sort_order")
    .order("sort_order");

  if (error) throw new Error(`Reading the service catalogue failed: ${error.message}`);

  return toServiceOptions(data as ServiceCatalogueRow[]);
});
