import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toQueueProfile, type QueueProfileRow, type QueueViewer } from "./queue-mapping";
import type { QueueProfile } from "./queue";

/**
 * The review queue's read. **The seam #72 left, filled.**
 *
 * `@/lib/directory` is the anonymous half of the same idea — the publishable key
 * and nothing else, every row one row level security decided a visitor may see.
 * This is the other half: the per-request client from `@/lib/supabase/server`,
 * carrying the reviewer's session and therefore the `bluehex_admin` role their
 * access token was stamped with. Never `@/lib/supabase/anon`, which is cached
 * for the life of the process and must never hold a session.
 *
 * Server-only by construction rather than by convention: the client it builds
 * reaches for `next/headers`, so a stray import from a client component fails
 * the build rather than shipping an admin read to a browser.
 *
 * **The role is what decides what comes back, not this file.** Nothing below
 * filters on `status`, and there is no `where` clause at all: `practitioners_admin_all`
 * is `using (true)` for `bluehex_admin` and returns nothing for anybody else, so
 * a practitioner who somehow reached this code path reads their own profile
 * through `practitioners_read_own` and no more. Deleting `requireAdmin` from the
 * page would make it ugly rather than insecure — see
 * `docs/adr/0001-admins-are-a-postgres-role.md`.
 *
 * **Every column is named**, as everywhere else in this repository. `select *`
 * is refused for `anon` and `authenticated` by the column-scoped grants;
 * `bluehex_admin` holds the whole table and could use one, and does not. The
 * list is the review screen's contract with the schema: a column that arrives
 * later is invisible here until somebody names it, which is the direction that
 * fails closed.
 *
 * **No `cache` from React and no `revalidate`.** The page is request-bound
 * already — `requireAdmin` reads cookies — and a review queue is the one screen
 * where a stale answer is worse than a slow one. The caching this ticket does
 * care about is on the *public* pages, which is `./actions` purging them after a
 * write.
 */

/* `evidence_url` rather than `evidence_url_public`: the masked column is what
   `anon` is granted and is null whenever the practitioner opted out of
   publishing it, and the reviewer's whole job is to open the thing. Admins hold
   the raw column; nothing else does.

   `verified_at` and `verified_by` are here for the same reason — they are the
   substance of the attestation rather than bookkeeping, and neither is granted
   below `bluehex_admin`.

   `sort_order` on the catalogue embed is read only to order the credential
   list; see `toCredentials`. */
const CREDENTIAL_COLUMNS =
  "practitioner_credentials(id,earned_at,evidence_url,evidence_public,verified,verified_at,verified_by,credential_catalogue(id,kind,platform,label,sort_order))" as const;

const SERVICE_COLUMNS =
  "practitioner_services(label,service_catalogue(label,sort_order))" as const;

/* `practitioner_contacts` is embedded through `practitioners.contact_id`, which
   is `not null unique`, so it comes back as a row rather than a collection. The
   address is never on the profile and never will be: a table with no `anon`
   grant cannot be leaked by a future `grant select on practitioners to anon`.

   `practitioner_review_notes` embeds the other way — its primary key *is* the
   foreign key — so it is also one row or none. `anon` has no grant on either
   table by any route. */
const PROFILE_COLUMNS =
  "id,name,headline,location,bio,focus,status,user_id,updated_at" as const;

/* `as const` throughout and the template const too: `supabase-js` parses the
   select string at the type level, and built with `+` the parts widen to
   `string`, the parser gives up, and `data` arrives as `GenericStringError[]`.
   With the literal preserved, a column that does not exist and an embed that is
   not a relationship are both build failures. */
const QUEUE_SELECT =
  `${PROFILE_COLUMNS},practitioner_contacts(contact_email),practitioner_review_notes(note),${CREDENTIAL_COLUMNS},${SERVICE_COLUMNS}` as const;

/**
 * Everything an admin has to look at.
 *
 * The whole table, unpaginated, because the screen filters and orders in the
 * browser: `partitionQueue` splits work from cleared and `outstanding()` decides
 * membership, over a list the page already holds whole. That is the same shape
 * the public roster uses, and the seam to move behind a route handler when the
 * queue outgrows one payload — the component's props do not change when it does.
 *
 * Ordered by name so two renders of the same rows produce the same page. It is
 * not the order anybody reads in — `sortQueue` puts the longest untouched first
 * — but row order from Postgres is otherwise whatever the plan produces, and a
 * list that reshuffles under a reviewer is one they cannot keep their place in.
 *
 * **This one throws rather than degrading to an empty list.** `@/lib/directory`
 * answers empty when Supabase is unconfigured, because a public page that
 * prerenders as an honest invitation card beats a failed build. There is no
 * equivalent trade here: an empty review queue and a broken one look identical,
 * and the difference is whether somebody's profile is waiting. The page is
 * behind `requireAdmin`, which has already required a session, which has already
 * required the environment.
 */
export async function readQueue(viewer: QueueViewer): Promise<QueueProfile[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("practitioners")
    .select(QUEUE_SELECT)
    .order("name");

  if (error) throw new Error(`Reading the review queue failed: ${error.message}`);

  return data.map((row: QueueProfileRow) => toQueueProfile(row, viewer));
}
