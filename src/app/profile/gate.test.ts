import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ADMIN_ROLE, type SessionClaims } from "@/lib/auth/claims";
import { accessFor, authRedirect, requirementFor } from "@/lib/auth/routes";

/**
 * The editor is a protected route, and this is what says so.
 *
 * Two halves, and they fail in different ways. The routing half is pure and is
 * asserted directly. The other half is that the page *opens with the guard* —
 * which cannot be observed without rendering a Server Component, and rendering
 * one needs a React environment `pnpm test` deliberately does not have. So it
 * is read off the source instead.
 *
 * A source assertion is a blunt instrument and is worth it here: deleting the
 * one line that gates the editor is a change nothing else in the suite would
 * notice, and the page would keep rendering — with somebody else's profile, to
 * anybody. It is the same reason the gate exists at all. The database is still
 * the enforcement: every table behind this page is guarded by row level
 * security and would refuse the same caller with this file deleted.
 */

/** A verified access token's claims, as `getClaims` hands them over. */
function claims(role: string): SessionClaims {
  return {
    iss: "http://127.0.0.1:54321/auth/v1",
    sub: "11111111-1111-1111-1111-111111111111",
    aud: "authenticated",
    exp: 2000000000,
    iat: 1999996400,
    role,
    aal: "aal1",
    session_id: "22222222-2222-2222-2222-222222222222",
  };
}

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);

describe("the profile editor's route", () => {
  it("needs an account", () => {
    expect(requirementFor("/profile")).toBe("account");
    expect(accessFor("account", null)).toBe("sign-in");
  });

  it("sends a signed-out visitor to sign in, remembering where they were going", () => {
    expect(authRedirect({ pathname: "/profile" }, null)).toBe("/sign-in?next=%2Fprofile");
  });

  it("lets a practitioner and an admin alike at it", () => {
    expect(authRedirect({ pathname: "/profile" }, claims("authenticated"))).toBeNull();
    expect(authRedirect({ pathname: "/profile" }, claims(ADMIN_ROLE))).toBeNull();
  });

  it("opens with the guard, and with the return path it is reached by", () => {
    expect(source).toContain('requireAccount("/profile")');
  });

  it("does not reach for the shared anonymous client", () => {
    /* `src/lib/supabase/anon.ts` is cached at module scope and serves every
       request in the process. A page holding somebody's session must never use
       it — see the note in that file. */
    expect(source).not.toContain("supabase/anon");
  });
});
