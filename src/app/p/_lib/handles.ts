/**
 * Resolving a profile handle back to a profile.
 *
 * The *generating* half of this lives in `@/lib/practitioners` as
 * `profilePath`, because the directory needs it to render links and that is
 * production code. Only the lookup is here, and only because what it looks up
 * is a throwaway fixture — a real build resolves against the database.
 *
 * There must be exactly one scheme. An earlier version of this file had its own
 * `profileHandle` that hashed the *name* into a short id, which disagreed with
 * production's "first six characters of the uuid" the moment both existed: the
 * directory linked one way and the page resolved another. It is deleted rather
 * than reconciled.
 *
 * The lookup reads only the trailing short id and ignores the slug, which is
 * what makes a URL survive a rename — `/p/mara-ellison-9f3c1a` and
 * `/p/her-new-name-9f3c1a` are the same profile, and a real build would notice
 * the mismatch and serve a canonical redirect.
 */

import { launchPopulation } from "@/app/prototype/directory/fixtures";

export function findByHandle(handle: string) {
  const id = handle.split("-").at(-1);
  if (!id) return null;
  return launchPopulation.find((person) => person.id.slice(0, 6) === id) ?? null;
}
