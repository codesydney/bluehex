/**
 * Resolving a profile handle back to a profile.
 *
 * The *generating* half of this lives in `@/lib/practitioners` as `profilePath`,
 * because the directory needs it to render links. Only the lookup is here.
 *
 * There must be exactly one scheme. An earlier version of this file had its own
 * `profileHandle` that hashed the *name* into a short id, which disagreed with
 * production's "first six characters of the uuid" the moment both existed: the
 * directory linked one way and the page resolved another. It is deleted rather
 * than reconciled.
 *
 * The lookup reads only the trailing short id and ignores the slug, which is
 * what makes a URL survive a rename — `/p/mara-ellison-9f3c1a` and
 * `/p/her-new-name-9f3c1a` are the same profile. The route redirects a
 * non-canonical slug to the canonical one rather than serving both.
 *
 * **It resolves against Postgres now, in two steps, and the shape is forced by
 * the identifier.** A handle carries six characters of a uuid, and Postgres has
 * no prefix match on `uuid` — so the ids come back first and the match happens
 * in memory, then the profile that matched is read by its whole id. Both reads
 * are `anon`, so both are already filtered by row level security: a profile that
 * is not `approved` is absent from the id list and the handle 404s, which is the
 * same answer it gave when the list was an empty array in TypeScript.
 */

import { getProfile, listProfileIds } from "@/lib/directory";

export async function findByHandle(handle: string) {
  const short = handle.split("-").at(-1);
  if (!short) return null;

  /* Six characters, lowercase hex. Checked rather than assumed, so that a
     handle ending in something that is not part of a uuid answers null instead
     of scanning the whole list to conclude the same thing. */
  if (!/^[0-9a-f]{6}$/i.test(short)) return null;

  const ids = await listProfileIds();
  /* The first row that matches, which is what the array lookup did. Nothing yet
     guarantees six characters are unique, so a collision serves the wrong
     profile rather than a 404 — the enforcement belongs in the schema and is
     open on the review of #63.

     **It is not hypothetical any more, and the local seed is where it shows.**
     `supabase/seed.sql` keys its profiles `22222222-0000-4000-8000-00000000000N`
     so a stray uuid in a log says which table it came from, which is a good
     reason and has the side effect that all eight share the first six
     characters. So every `View profile` on a freshly reset local directory
     resolves to the same person. Real uuids are random and collide far more
     rarely, but "far more rarely" is what #63 exists to replace with "never".
     `listProfileIds` orders its rows so that at least the wrong answer is the
     same wrong answer every time. */
  const id = ids.find((candidate) => candidate.slice(0, 6).toLowerCase() === short.toLowerCase());

  return id ? getProfile(id) : null;
}
