import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  adminCaller,
  anonCaller,
  practitionerCaller,
  type Caller,
} from "./harness/callers";
import {
  expectAllowed,
  expectPermissionDenied,
  sqlstate,
} from "./harness/result";
import { sql } from "./harness/stack";

/**
 * One smoke assertion per fixture, proving the seam rather than the schema. There
 * is no product schema yet — `practitioners` and the catalogues arrive with #49
 * and after — so what is under test here is the harness itself: that each of the
 * four callers reaches PostgREST, and that it arrives as who the harness says it
 * is. The real assertions ride with the tickets that introduce the tables.
 *
 * `public.admins` is what all four read, because it is the only table in the
 * database and because nobody is granted anything on it: the migration grants
 * `select` to `supabase_auth_admin` alone. The same read is therefore refused for
 * every caller, and what differs is the status code — which is exactly the trap
 * `expectPermissionDenied` exists to encode.
 */

let anon: Caller;
let practitioner: Caller;
let otherPractitioner: Caller;
let admin: Caller;

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  practitioner = await practitionerCaller("practitioner");
  otherPractitioner = await practitionerCaller("other practitioner");
  admin = await adminCaller("admin");
});

describe("the anon fixture", () => {
  it("reaches PostgREST and is refused the admin list as 401", async () => {
    const result = await anon.client.from("admins").select("user_id");

    expectPermissionDenied(anon, result);
    /* Spelled out here, once, against the helper that derives it. 401 for the
       same `permission denied` a signed-in caller gets as 403. */
    expect(result.status).toBe(401);
  });
});

describe("the practitioner fixture", () => {
  it("arrives as authenticated, as itself", () => {
    expect(practitioner.claims?.role).toBe("authenticated");
    /* `sub` is what `auth.uid()` resolves to, so every ownership policy in the
       spec is written against this value. */
    expect(practitioner.claims?.sub).toBe(practitioner.userId);
  });

  it("reaches PostgREST and is refused the admin list as 403", async () => {
    const result = await practitioner.client.from("admins").select("user_id");

    expectPermissionDenied(practitioner, result);
    expect(result.status).toBe(403);
  });
});

describe("the second practitioner fixture", () => {
  it("is a different person from the first", () => {
    /* The point of the fixture. An assertion written from the owner of a row
       passes identically whether row level security is on or off; only a second
       account can prove a policy ever executes. */
    expect(otherPractitioner.userId).not.toBe(practitioner.userId);
    expect(otherPractitioner.claims?.sub).toBe(otherPractitioner.userId);
  });

  it("reaches PostgREST as its own account", async () => {
    const result = await otherPractitioner.client.from("admins").select("user_id");

    expectPermissionDenied(otherPractitioner, result);
  });
});

describe("the admin fixture", () => {
  it("holds the bluehex_admin role, stamped onto its token by the hook", () => {
    /* The whole of admin authority. `custom_access_token_hook` rewrote the `role`
       claim because the account is listed in `public.admins`; PostgREST switches
       to whatever role that claim names. If this is `authenticated`, the fixture
       is an ordinary practitioner wearing the word "admin". */
    expect(admin.claims?.role).toBe("bluehex_admin");
  });

  it("keeps its own identity — the hook rewrites the role, not the subject", () => {
    /* `auth.uid()` must still resolve to the person, or an admin cannot own a
       profile and every ownership policy misfires for them alone. */
    expect(admin.claims?.sub).toBe(admin.userId);
  });

  it("is listed in public.admins", async () => {
    const rows = await sql("select 1 from public.admins where user_id = $1", [
      admin.userId,
    ]);

    expect(rows).toHaveLength(1);
  });

  it("still gets no table it was not granted", async () => {
    /* Being an admin is not a bypass. `bluehex_admin` has `usage` on the schema
       and nothing else until a migration grants it something, so it is refused
       `public.admins` exactly as a practitioner is — and as a signed-in caller,
       so 403. */
    const result = await admin.client.from("admins").select("user_id");

    expectPermissionDenied(admin, result);
  });
});

describe("the SQL seam", () => {
  /* Restored after every test in this block, because a leaked grant would make
     every assertion above pass for the wrong reason. */
  afterEach(async () => {
    await sql("revoke select on public.admins from anon");
  });

  it("runs as postgres", async () => {
    const rows = await sql<{ current_user: string }>("select current_user");

    /* Superuser, and deliberately so: `public.admins` has no grant to any API
       role, so there is no HTTP request that can create an admin. The rule that
       keeps this honest is that setup goes through SQL and assertions go through a
       caller — re-reading a row as `postgres` proves nothing about a policy,
       because `postgres` bypasses every one of them. */
    expect(rows[0]?.current_user).toBe("postgres");
  });

  it("can grant and revoke a privilege a caller then sees change", async () => {
    /* The mechanism the spec's most valuable assertion needs: revoke a grant,
       confirm the write is refused, re-grant it by hand and confirm the trigger
       still refuses it. That test lands in #55 against a schema that has triggers;
       this proves the seam it will be written on. */
    const before = await anon.client.from("admins").select("user_id");
    expectPermissionDenied(anon, before);

    await sql("grant select on public.admins to anon");
    const after = await anon.client.from("admins").select("user_id");

    /* Granted, so no longer 42501 — and empty, because row level security is a
       second layer and `admins` has no policy for `anon`. The two are separate
       and this is the shape of getting them confused: a table with a correct
       policy and no grant reads as a broken policy, and a table with a grant and
       no policy reads as an empty database. */
    expectAllowed(after);
    expect(after.data).toEqual([]);

    await sql("revoke select on public.admins from anon");
    const restored = await anon.client.from("admins").select("user_id");

    expectPermissionDenied(anon, restored);
    expect(restored.error?.code).toBe(sqlstate.insufficientPrivilege);
  });
});
