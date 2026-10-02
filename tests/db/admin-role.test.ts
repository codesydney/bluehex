import { describe, expect, it } from "vitest";

import {
  adminCaller,
  practitionerCaller,
  refreshed,
  type Caller,
  type TokenClaims,
} from "./harness/callers";
import { expectPermissionDenied, expectSqlstate } from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `bluehex_admin` and the hook that stamps it: the properties of the role itself,
 * which belong to no table.
 *
 * Two things ADR 0001 records about the mechanism: that the hook rewrites `role`
 * and leaves who the token is for as it was, and that authority carried in a token
 * outlives the row that granted it until the next refresh.
 */

/**
 * A profile id that names nothing. `approve_practitioner()` raises `P0002`
 * (`no_data_found`) for it when the caller may execute the function and is
 * refused with `42501` before it runs otherwise, so the call measures `execute`
 * and needs no profile to be built first.
 */
const nobody = "00000000-0000-0000-0000-000000000000";

function approveNobody(caller: Caller) {
  return caller.client.rpc("approve_practitioner", { profile_id: nobody });
}

/**
 * `aud` as a value. Its JSON is an array on the first token GoTrue mints after it
 * starts and a string on every later one (ADR 0001), so a comparison of the JSON
 * fails on whichever test signs in first after a restart.
 */
function audience(claims: TokenClaims | null): unknown[] {
  return [claims?.aud].flat();
}

describe("the access token hook", () => {
  it("rewrites `role` and leaves the claims that say who the token is for", async () => {
    const person = await practitionerCaller("promoted");
    await sql("insert into public.admins (user_id) values ($1)", [person.userId]);

    const promoted = await refreshed(person);

    expect(person.claims?.role).toBe("authenticated");
    expect(promoted.claims?.role).toBe("bluehex_admin");
    expect(promoted.claims?.sub).toBe(person.claims?.sub);
    expect(promoted.claims?.email).toBe(person.claims?.email);
    expect(audience(promoted.claims)).toEqual(audience(person.claims));
    expect(audience(promoted.claims)).toEqual(["authenticated"]);
  });
});

describe("revoking an admin", () => {
  it("takes effect on the next refresh, and not before", async () => {
    const admin = await adminCaller("revoked admin");
    expectSqlstate(await approveNobody(admin), "P0002");

    await sql("delete from public.admins where user_id = $1", [admin.userId]);

    /* The lag. The token was minted while the row existed and says
       `bluehex_admin` until it expires, whatever the table says now. */
    expectSqlstate(await approveNobody(admin), "P0002");

    const revoked = await refreshed(admin);

    expect(revoked.claims?.role).toBe("authenticated");
    expectPermissionDenied(revoked, await approveNobody(revoked));
  });
});
