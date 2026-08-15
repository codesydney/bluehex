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
 * It resolves against `practitioners`, which is empty and stays empty until real
 * people are in it — so every handle 404s today. That is the same emptiness the
 * directory renders its invitation card for, not a missing case.
 */

import { practitioners } from "@/lib/practitioners";

export function findByHandle(handle: string) {
  const id = handle.split("-").at(-1);
  if (!id) return null;
  return practitioners.find((person) => person.id.slice(0, 6) === id) ?? null;
}
