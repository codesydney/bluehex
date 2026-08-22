import type { JwtPayload } from "@supabase/supabase-js";

/**
 * Reading who the caller is off a verified access token.
 *
 * Nothing here authorises anything. Postgres does that: the admin grants belong
 * to the `bluehex_admin` role and are checked by the database on every
 * statement, whatever this file says. What this file is for is *presentation* —
 * showing an admin the admin link, and keeping a practitioner from walking into
 * a page whose every query would be refused. Treating `isAdmin` as the control
 * would be the second authorization model that choosing RLS over an ORM exists
 * to avoid. See `docs/adr/0001-admins-are-a-postgres-role.md`.
 */

/**
 * The Postgres role the access token hook stamps onto an admin's token.
 *
 * Written once here and compared exactly. It is the same string as the role in
 * `20260815012304_admin_role_and_access_token_hook.sql`, and the two are only
 * kept in step by this comment — a rename there without a rename here shows up
 * as an admin who can do everything and is shown nothing.
 */
export const ADMIN_ROLE = "bluehex_admin";

export type SessionClaims = JwtPayload;

/**
 * Who is asking, reduced to what the UI needs.
 *
 * `isAdmin` is a snapshot of a token, not a live reading of `public.admins`.
 * Removing someone from that table takes effect on their next token refresh —
 * an hour by default — so authority lags revocation by the life of an access
 * token. To cut an admin off immediately, invalidate their sessions rather than
 * editing the table.
 */
export type Viewer = {
  /** `auth.uid()`, the same value every policy in the schema is written against. */
  id: string;
  email: string | null;
  isAdmin: boolean;
};

/** True only for the exact admin role. Anything else — `authenticated`, `anon`, absent — is not an admin. */
export function isAdmin(claims: SessionClaims | null | undefined): boolean {
  return claims?.role === ADMIN_ROLE;
}

/**
 * The viewer a set of claims describes, or `null` if there are none.
 *
 * Note what is *not* read: `aud`. GoTrue re-serialises the claims struct when
 * the hook has modified them, so an admin's token carries `"aud":
 * ["authenticated"]` where an untouched one carries `"aud": "authenticated"`.
 * Anything comparing that field against a string passes for practitioners and
 * fails for admins alone — the worst shape a bug can take here. `role` and `sub`
 * are the only claims this reads.
 */
export function viewerFromClaims(claims: SessionClaims | null | undefined): Viewer | null {
  if (!claims?.sub) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    isAdmin: isAdmin(claims),
  };
}
