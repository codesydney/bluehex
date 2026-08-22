import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { viewerFromClaims, type SessionClaims, type Viewer } from "./claims";
import { accessFor, FORBIDDEN_PATH, signInPath, type Requirement } from "./routes";

/**
 * Reading the session on the server, and the guards a protected page opens with.
 *
 * Server-only: `createServerSupabaseClient` reaches for `next/headers`, so
 * importing any of this from a client component fails the build.
 */

/**
 * The verified claims on this request's access token, or `null`.
 *
 * `getClaims` and not `getSession`. The session comes out of a cookie, which the
 * caller controls, so the user object on it is only as trustworthy as whoever
 * sent the request; `getClaims` checks the signature — locally against the
 * project's published keys where they are asymmetric, and against the Auth
 * server otherwise — before returning anything.
 *
 * Wrapped in React's `cache`, so a layout and the page inside it asking the same
 * question during one render costs one verification rather than two.
 */
export const readClaims = cache(async (): Promise<SessionClaims | null> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();

  /* An expired or tampered token is not an exception, it is a signed-out
     visitor. Anything else — the Auth server unreachable, a malformed JWKS —
     lands here too and is treated the same way, which is the safe direction:
     the caller gets no session rather than an unverified one. */
  if (error || !data) return null;

  return data.claims;
});

/** The viewer on this request, or `null`. For pages that render either way. */
export async function readViewer(): Promise<Viewer | null> {
  return viewerFromClaims(await readClaims());
}

/**
 * `returnTo` is the pathname of the page doing the guarding, so that signing in
 * lands the visitor back where they were headed. It is a parameter rather than
 * something read from the request because a Server Component has no pathname —
 * there is no `usePathname` on the server, and threading one through a header
 * set by the proxy would be a second mechanism doing the same job.
 */
async function guard(requirement: Requirement, returnTo: string): Promise<Viewer> {
  const claims = await readClaims();
  const access = accessFor(requirement, claims);

  if (access === "sign-in") redirect(signInPath(returnTo));
  if (access === "forbidden") redirect(FORBIDDEN_PATH);

  const viewer = viewerFromClaims(claims);

  /* Allowed, but the token carries no `sub`. Nothing mints one of those, and if
     something does it is not a person — send them to sign in rather than hand a
     page a viewer with no identity. */
  if (!viewer) redirect(signInPath(returnTo));

  return viewer;
}

/**
 * Require a signed-in account, or redirect to the sign-in form.
 *
 * The database is still the enforcement point. This runs so a signed-out visitor
 * meets the form rather than a page whose every query is refused, and so that a
 * change to what "signed in" means happens in one place.
 */
export function requireAccount(returnTo: string): Promise<Viewer> {
  return guard("account", returnTo);
}

/**
 * Require `role: bluehex_admin` on the token, or redirect.
 *
 * Presentation, not authorization: the admin grants live on the `bluehex_admin`
 * Postgres role and are checked by Postgres on every statement. Deleting this
 * call would make the page ugly, not insecure. See
 * `docs/adr/0001-admins-are-a-postgres-role.md`.
 */
export function requireAdmin(returnTo: string): Promise<Viewer> {
  return guard("admin", returnTo);
}
