import { describe, expect, it } from "vitest";

import { ADMIN_ROLE, type SessionClaims } from "./claims";
import {
  accessFor,
  authRedirect,
  FORBIDDEN_PATH,
  requirementFor,
  safeReturnTo,
  SIGN_IN_PATH,
  SIGNED_IN_HOME,
  signInPath,
} from "./routes";

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

const practitioner = claims("authenticated");
const admin = claims(ADMIN_ROLE);

describe("requirementFor", () => {
  it("leaves the public site public", () => {
    for (const path of ["/", "/contact", "/p/mara-ellison", SIGN_IN_PATH, "/auth/callback"]) {
      expect(requirementFor(path)).toBe("public");
    }
  });

  it("gates the account and admin roots, and everything beneath them", () => {
    expect(requirementFor("/profile")).toBe("account");
    expect(requirementFor("/profile/edit")).toBe("account");
    expect(requirementFor("/admin")).toBe("admin");
    expect(requirementFor("/admin/queue/17")).toBe("admin");
  });

  it("matches on segment boundaries, not on string prefixes", () => {
    /* A bare `startsWith` would gate both of these. Neither is under the root
       that shares its first characters. */
    expect(requirementFor("/profiles")).toBe("public");
    expect(requirementFor("/administrators")).toBe("public");
  });
});

describe("safeReturnTo", () => {
  it("accepts a same-origin path", () => {
    expect(safeReturnTo("/profile")).toBe("/profile");
    expect(safeReturnTo("/admin/queue?open=17")).toBe("/admin/queue?open=17");
    expect(safeReturnTo("/")).toBe("/");
  });

  it("rejects anything that could leave the site", () => {
    /* Each of these is a URL a browser resolves off-origin, and each arrives in
       a query string somebody else can write. */
    expect(safeReturnTo("https://example.invalid/phish")).toBeNull();
    expect(safeReturnTo("//example.invalid")).toBeNull();
    expect(safeReturnTo("/\\example.invalid")).toBeNull();
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
    expect(safeReturnTo("profile")).toBeNull();
  });

  it("rejects control characters, which browsers strip before resolving", () => {
    expect(safeReturnTo("/\u0009/example.invalid")).toBeNull();
    expect(safeReturnTo("/\n/example.invalid")).toBeNull();
    expect(safeReturnTo("/profile\u007f")).toBeNull();
  });

  it("rejects nothing at all", () => {
    expect(safeReturnTo("")).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
  });
});

describe("signInPath", () => {
  it("remembers where the visitor was going", () => {
    expect(signInPath("/admin/queue?open=17")).toBe(
      `${SIGN_IN_PATH}?next=%2Fadmin%2Fqueue%3Fopen%3D17`,
    );
  });

  it("drops a destination it would not honour anyway", () => {
    expect(signInPath("https://example.invalid")).toBe(SIGN_IN_PATH);
    expect(signInPath(null)).toBe(SIGN_IN_PATH);
    expect(signInPath()).toBe(SIGN_IN_PATH);
  });
});

describe("accessFor", () => {
  it("lets anyone at a public route", () => {
    expect(accessFor("public", null)).toBe("allow");
    expect(accessFor("public", practitioner)).toBe("allow");
  });

  it("sends a signed-out caller to sign in, whatever was being asked for", () => {
    expect(accessFor("account", null)).toBe("sign-in");
    expect(accessFor("admin", null)).toBe("sign-in");
  });

  it("separates having an account from holding the admin role", () => {
    expect(accessFor("account", practitioner)).toBe("allow");
    expect(accessFor("admin", practitioner)).toBe("forbidden");
    expect(accessFor("account", admin)).toBe("allow");
    expect(accessFor("admin", admin)).toBe("allow");
  });
});

describe("authRedirect", () => {
  it("lets a public route through for anyone", () => {
    expect(authRedirect({ pathname: "/" }, null)).toBeNull();
    expect(authRedirect({ pathname: "/contact" }, practitioner)).toBeNull();
  });

  it("sends a signed-out visitor to sign in, carrying where they were going", () => {
    expect(authRedirect({ pathname: "/profile" }, null)).toBe(`${SIGN_IN_PATH}?next=%2Fprofile`);
    expect(authRedirect({ pathname: "/admin" }, null)).toBe(`${SIGN_IN_PATH}?next=%2Fadmin`);
  });

  it("sends a signed-in practitioner off the admin routes", () => {
    expect(authRedirect({ pathname: "/admin" }, practitioner)).toBe(FORBIDDEN_PATH);
    expect(authRedirect({ pathname: "/admin/queue" }, practitioner)).toBe(FORBIDDEN_PATH);
  });

  it("lets each caller at what is theirs", () => {
    expect(authRedirect({ pathname: "/profile" }, practitioner)).toBeNull();
    expect(authRedirect({ pathname: "/admin" }, admin)).toBeNull();
  });

  it("keeps a signed-out visitor on the sign-in form", () => {
    expect(authRedirect({ pathname: SIGN_IN_PATH }, null)).toBeNull();
    expect(authRedirect({ pathname: SIGN_IN_PATH, returnTo: "/profile" }, null)).toBeNull();
  });

  it("takes a signed-in visitor off it, honouring a safe destination only", () => {
    expect(authRedirect({ pathname: SIGN_IN_PATH }, practitioner)).toBe(SIGNED_IN_HOME);
    expect(authRedirect({ pathname: SIGN_IN_PATH, returnTo: "/admin" }, admin)).toBe("/admin");
    expect(
      authRedirect({ pathname: SIGN_IN_PATH, returnTo: "https://example.invalid" }, practitioner),
    ).toBe(SIGNED_IN_HOME);
  });
});
