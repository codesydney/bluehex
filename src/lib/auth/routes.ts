import { isAdmin, type SessionClaims } from "./claims";

/**
 * Which routes need an account, which need the admin role, and where someone
 * who has neither gets sent.
 *
 * Pure functions over a pathname and a set of claims, so the proxy and the
 * server-side guards decide the same way and one set of tests covers both.
 * Nothing here touches cookies, Supabase or Next.
 *
 * This is a gate on *navigation*, not on data. Every table the protected pages
 * will read is already guarded by row level security, and would refuse the same
 * caller with no help from this file. What the gate buys is that a signed-out
 * visitor lands on the sign-in form instead of on a page of permission errors.
 */

export const SIGN_IN_PATH = "/sign-in";
export const CALLBACK_PATH = "/auth/callback";

/** Where a signed-in person goes when nothing more specific was asked for. */
export const SIGNED_IN_HOME = "/profile";

/** The query parameter carrying where the visitor was headed before the gate. */
export const RETURN_TO_PARAM = "next";

export type Requirement = "public" | "account" | "admin";

/** Roots that need a signed-in account. Everything beneath one inherits it. */
const ACCOUNT_ROOTS = ["/profile"] as const;

/**
 * Roots that additionally need `role: bluehex_admin` on the token. #72 builds
 * the review queue here; the grants it will use are already admin-only in the
 * schema, so this list decides where the visitor is sent rather than what they
 * could otherwise reach.
 */
const ADMIN_ROOTS = ["/admin"] as const;

/**
 * Segment-boundary prefix match. `/profile` covers `/profile/edit` and does not
 * cover `/profiles` — a bare `startsWith` would gate the second, which is the
 * kind of mistake that only shows up once somebody adds a route whose name
 * happens to share a prefix.
 */
function isUnder(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function requirementFor(pathname: string): Requirement {
  if (ADMIN_ROOTS.some((root) => isUnder(pathname, root))) return "admin";
  if (ACCOUNT_ROOTS.some((root) => isUnder(pathname, root))) return "account";
  return "public";
}

/** C0 controls and DEL. Browsers strip some of these from a URL before resolving it. */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}

/**
 * A caller-supplied return path, or `null` if it is not one.
 *
 * The value arrives in a query string and in a magic-link URL, so it is
 * attacker-controlled: without this a link could carry
 * `?next=https://example.invalid` and the sign-in flow would hand the visitor to
 * whoever sent it, from our own origin, immediately after they authenticated.
 *
 * Only a same-origin absolute path survives. `//evil.example` is a
 * protocol-relative URL, and `/\evil.example` is one too as far as every browser
 * is concerned — both would leave the site while looking like a path.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (hasControlCharacter(value)) return null;

  return value;
}

/** The sign-in URL, remembering where the visitor was going. */
export function signInPath(returnTo?: string | null): string {
  const safe = safeReturnTo(returnTo);
  if (!safe) return SIGN_IN_PATH;

  return `${SIGN_IN_PATH}?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`;
}

/**
 * Where a signed-in visitor goes when they are signed in and still not allowed.
 *
 * The home page rather than a 404 or an error. The admin routes are named in a
 * public repository, so hiding their existence buys nothing, and a practitioner
 * who followed a stale link should land somewhere useful.
 */
export const FORBIDDEN_PATH = "/";

export type Access = "allow" | "sign-in" | "forbidden";

/**
 * The one decision, made once.
 *
 * The proxy and the page guards both route through this, so a change to what
 * `admin` means cannot land in one and not the other. It is also the only part
 * of the gate worth testing exhaustively, which is why it takes a requirement
 * and claims rather than a request.
 */
export function accessFor(requirement: Requirement, claims: SessionClaims | null): Access {
  if (requirement === "public") return "allow";
  if (claims === null) return "sign-in";
  if (requirement === "admin" && !isAdmin(claims)) return "forbidden";

  return "allow";
}

/** Where this request should be sent instead, or `null` to let it through. */
export function authRedirect(
  { pathname, returnTo }: { pathname: string; returnTo?: string | null },
  claims: SessionClaims | null,
): string | null {
  /* The sign-in form is not somewhere a signed-in person has any use for, and
     arriving there with a `next` still pending means the link they followed was
     for a page they can now see. */
  if (pathname === SIGN_IN_PATH) {
    return claims === null ? null : (safeReturnTo(returnTo) ?? SIGNED_IN_HOME);
  }

  switch (accessFor(requirementFor(pathname), claims)) {
    case "sign-in":
      return signInPath(pathname);
    case "forbidden":
      return FORBIDDEN_PATH;
    case "allow":
      return null;
  }
}
