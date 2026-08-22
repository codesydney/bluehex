import { describe, expect, it } from "vitest";

import { ADMIN_ROLE, isAdmin, viewerFromClaims, type SessionClaims } from "./claims";

/**
 * Claims arrive from a verified token, so these tests are not about parsing —
 * they are about the two ways reading them goes wrong quietly: an admin who is
 * not recognised as one, and a non-admin who is.
 */
function claims(overrides: Partial<SessionClaims> = {}): SessionClaims {
  return {
    iss: "http://127.0.0.1:54321/auth/v1",
    sub: "11111111-1111-1111-1111-111111111111",
    aud: "authenticated",
    exp: 2000000000,
    iat: 1999996400,
    role: "authenticated",
    aal: "aal1",
    session_id: "22222222-2222-2222-2222-222222222222",
    email: "practitioner@example.com",
    ...overrides,
  };
}

describe("isAdmin", () => {
  it("is true for the role the access token hook stamps", () => {
    expect(isAdmin(claims({ role: ADMIN_ROLE }))).toBe(true);
  });

  it("is false for an ordinary signed-in practitioner", () => {
    expect(isAdmin(claims())).toBe(false);
  });

  it("is false for anon, for no claims, and for a near miss", () => {
    expect(isAdmin(claims({ role: "anon" }))).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin(claims({ role: "bluehex_admin " }))).toBe(false);
    expect(isAdmin(claims({ role: "BLUEHEX_ADMIN" }))).toBe(false);
  });

  it("does not care what shape `aud` takes", () => {
    /* GoTrue re-serialises the claims when the hook has modified them, so an
       admin's token carries `aud` as an array and an untouched one carries it as
       a string. Anything reading `aud` would therefore pass for practitioners
       and fail for admins alone. Recorded in
       `docs/adr/0001-admins-are-a-postgres-role.md`. */
    expect(isAdmin(claims({ role: ADMIN_ROLE, aud: ["authenticated"] }))).toBe(true);
    expect(isAdmin(claims({ aud: ["authenticated"] }))).toBe(false);
  });
});

describe("viewerFromClaims", () => {
  it("carries the subject through as the id every policy is written against", () => {
    expect(viewerFromClaims(claims())).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "practitioner@example.com",
      isAdmin: false,
    });
  });

  it("marks an admin", () => {
    expect(viewerFromClaims(claims({ role: ADMIN_ROLE }))?.isAdmin).toBe(true);
  });

  it("tolerates a token with no email", () => {
    expect(viewerFromClaims(claims({ email: undefined }))?.email).toBeNull();
  });

  it("is null without claims, and without a subject", () => {
    expect(viewerFromClaims(null)).toBeNull();
    expect(viewerFromClaims(undefined)).toBeNull();
    expect(viewerFromClaims(claims({ sub: "" }))).toBeNull();
  });
});
