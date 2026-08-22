import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminCaller,
  anonCaller,
  practitionerCaller,
  type Caller,
} from "./harness/callers";
import {
  expectAllowed,
  expectPermissionDenied,
  expectSqlstate,
  sqlstate,
} from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `practitioners.handle` — the public identifier, and the uniqueness that is the
 * whole of #119.
 *
 * It replaces `id.slice(0, 6)`, which was computed in TypeScript and enforced by
 * nothing: `findByHandle` resolved with `.find()`, so two profiles sharing six
 * characters did not error — one of them was served under both URLs, with the
 * wrong person's credentials and the wrong person's badge on the page. That is
 * the worst failure this product has available, because it fails open and looks
 * fine, and the reason it is fixed in the schema rather than in the resolver is
 * that a resolver cannot promise uniqueness at all.
 *
 * Three things are asserted here and they are separate claims:
 *
 *   1. **The generator.** `public.new_profile_handle()` packs 40 bits into eight
 *      Crockford base32 characters by hand, because Postgres `encode()` has no
 *      `base32` — only `base64`, `hex` and `escape`. Hand-written bit packing is
 *      where an off-by-one hides: a wrong shift gives a short handle, or one
 *      whose positions share bits, and either looks fine until the collision rate
 *      is wrong. It is sampled rather than reasoned about.
 *   2. **The column.** `not null unique` plus `practitioners_handle_format`, so a
 *      duplicate and a malformed literal are both refused by Postgres.
 *   3. **Who may write it.** Nobody but Bluehex, by the same two mechanisms that
 *      protect `status` and `verified` — the column absent from every grant
 *      `authenticated` holds, and `practitioners_guard` pinning it to `OLD`.
 *      Neither is sufficient alone, and the backstop below is the assertion that
 *      catches a later migration re-granting the column, which fails open and
 *      silently.
 */

/** Crockford base32, lowercase: no `i`, no `l`, no `o`, no `u`. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const HANDLE = /^[0123456789abcdefghjkmnpqrstvwxyz]{8}$/;

let anon: Caller;
let practitioner: Caller;
let admin: Caller;

/** The practitioner's own profile. Owned, so every refusal below is about the
    column rather than about the row belonging to somebody else. */
let mine: string;

/**
 * Every row this file wrote, so `afterAll` can take them out again.
 *
 * Not tidiness. A leaked profile is a row the *next* file counts, and a leaked
 * contact is one `practitioner-seed.test.ts` would have to reason about — the
 * whole suite runs serially against one database precisely because these files
 * share global state.
 */
const seededProfiles: string[] = [];
const seededContacts: string[] = [];

/** Writes a contact row as `postgres` and returns its id. Set-up is SQL; every
    assertion is a caller. */
let contacts = 0;
async function seedContact(createdBy: string | null = null): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email, created_by)
     values ($1, $2) returning id`,
    [`handle-${contacts}-${Date.now()}@bluehex.test`, createdBy],
  );
  seededContacts.push(row!.id);
  return row!.id;
}

/**
 * Writes a profile as `postgres` and returns its id *and its handle*.
 *
 * `handle` is deliberately never passed: every fixture in this file takes the
 * column default, which is also the assertion that the default fires at all.
 */
async function seedProfile(userId: string | null = null): Promise<{
  id: string;
  handle: string;
}> {
  const [row] = await sql<{ id: string; handle: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, 'harness handle fixture', 'approved') returning id, handle`,
    [await seedContact(userId), userId],
  );
  seededProfiles.push(row!.id);
  return row!;
}

/** Reads a handle back as `postgres`, for bookkeeping rather than as evidence. */
async function handleOf(id: string): Promise<string> {
  const [row] = await sql<{ handle: string }>(
    "select handle from public.practitioners where id = $1",
    [id],
  );
  return row!.handle;
}

beforeAll(async () => {
  anon = anonCaller();
  practitioner = await practitionerCaller("practitioner");
  admin = await adminCaller("admin");

  mine = (await seedProfile(practitioner.userId)).id;
});

afterAll(async () => {
  /* Profiles first: `practitioners.contact_id` is a `not null` reference with no
     `on delete` clause, so a contact still pointed at refuses to go. */
  await sql("delete from public.practitioners where id = any($1::uuid[])", [seededProfiles]);
  await sql("delete from public.practitioner_contacts where id = any($1::uuid[])", [
    seededContacts,
  ]);
});

describe("the generator", () => {
  /**
   * One sample, shared by the suite. 2,000 handles is 16,000 characters, which is
   * enough that every one of the checks below would fail on a bit-packing error
   * with a margin of many orders of magnitude, and small enough to cost one round
   * trip.
   */
  let sample: string[];

  beforeAll(async () => {
    const rows = await sql<{ handle: string }>(
      "select public.new_profile_handle() as handle from generate_series(1, 2000)",
    );
    sample = rows.map((row) => row.handle);
    expect(sample).toHaveLength(2000);
  });

  it("produces eight characters, every time", () => {
    /* The failure this catches is a shift that runs off the end of the 40 bits
       and contributes nothing, which shortens the handle rather than erroring. */
    expect(sample.filter((handle) => handle.length !== 8)).toEqual([]);
  });

  it("produces nothing outside the Crockford alphabet", () => {
    /* `i`, `l`, `o` and `u` are excluded so a handle read aloud or copied off a
       screen is unambiguous. A 33-symbol alphabet string, or an index that can
       reach past 32, would put one of them back — and the column's format
       constraint would then refuse the row the default just generated, which is a
       failure at insert time on a table whose whole job is accepting profiles. */
    expect(sample.filter((handle) => !HANDLE.test(handle))).toEqual([]);
  });

  it("reaches every symbol at every position", () => {
    /* The direct test for a shift that is too wide. `(packed >> 36) & 31` at slot
       0 would read only four bits and reach 16 symbols rather than 32; with 2,000
       samples the chance of a symbol being absent from a position by luck alone is
       about e^-62, so a gap here is a bug and never noise. */
    for (let position = 0; position < 8; position += 1) {
      const seen = new Set(sample.map((handle) => handle[position]));
      expect(
        [...ALPHABET].filter((symbol) => !seen.has(symbol)),
        `symbols missing at position ${position}`,
      ).toEqual([]);
    }
  });

  it("gives adjacent positions independent bits", () => {
    /* The test the one above cannot do, and the reason both are here. A shift
       that overlaps — 34 instead of 35 — still reaches all 32 symbols at every
       position, so coverage alone passes while the handle carries 36 bits
       pretending to be 40. Overlapping four bits leaves only 2^6 = 64 possible
       adjacent pairs; independent positions have 2^10 = 1,024, of which 2,000
       samples reach around 880. The bound below sits far outside both. */
    for (let position = 0; position < 7; position += 1) {
      const pairs = new Set(sample.map((handle) => handle.slice(position, position + 2)));
      expect(pairs.size, `distinct pairs at positions ${position}–${position + 1}`)
        .toBeGreaterThan(500);
    }
  });

  it("does not repeat itself", () => {
    /* 40 bits is 1.1e12 values, so the expected number of collisions in 2,000
       draws is about 2e-6. A duplicate here is a generator that is not random,
       not bad luck. */
    expect(new Set(sample).size).toBe(sample.length);
  });

  it("is not callable by `anon`, which never inserts anything", async () => {
    /* Functions in `public` are executable by PUBLIC by default, so the `revoke`
       in the migration is the mechanism rather than tidiness. `authenticated`
       does hold it, and needs to: a column default is evaluated with the
       privileges of whoever performs the insert, so without that grant the
       self-service profile insert fails naming a function nobody calls. */
    const result = await anon.client.rpc("new_profile_handle");

    expectPermissionDenied(anon, result);
  });
});

describe("the column", () => {
  it("gives every profile a handle without being asked", async () => {
    const profile = await seedProfile();

    /* The default is on the column rather than in application code, so an insert
       from a migration, from `supabase/seed.sql` or from a `psql` prompt gets one
       exactly as an insert from the app does. Nothing above passed a handle. */
    expect(profile.handle).toMatch(HANDLE);
  });

  it("refuses two profiles the same handle", async () => {
    const taken = await handleOf(mine);
    const contact = await seedContact();

    /* Through the admin caller rather than through `sql()`, because it is the
       write path that actually exists: `bluehex_admin` holds table-wide insert
       and is the only role that can name a handle at all. `unique` is what turns
       a collision from "the wrong person's profile is served" into an error
       somebody sees. */
    const result = await admin.client
      .from("practitioners")
      .insert({ contact_id: contact, name: "Collides", handle: taken } as never);

    expectSqlstate(result, sqlstate.uniqueViolation);
  });

  it("refuses a handle that is not eight Crockford characters", async () => {
    const profile = await seedProfile();

    /* `practitioners_handle_format` is not belt and braces on the generator,
       which cannot produce anything else. It is what constrains a *literal* —
       the seed's eight, an admin's correction, a vanity handle somebody adds
       later — and it is what holds `/p/anthropic-official` shut with no reserved
       word list for anyone to maintain and get wrong. */
    for (const rejected of ["anthropic-official", "SEED0001", "seed001", "seed0001x", "seed000i"]) {
      const result = await admin.client
        .from("practitioners")
        .update({ handle: rejected } as never)
        .eq("id", profile.id);

      expectSqlstate(result, sqlstate.checkViolation);
    }

    /* And the row is untouched, so the refusals above are refusals rather than a
       constraint firing after a partial write. */
    expect(await handleOf(profile.id)).toBe(profile.handle);
  });

  it("lets Bluehex correct one", async () => {
    const profile = await seedProfile();

    /* The only write path there is. Recorded as an assertion rather than left
       implicit, because "not practitioner-writable" is easy to over-read as "not
       writable", and a handle nobody can change is a mistake nobody can fix.

       `bhadm1n0` rather than the obvious `bluehex0`, which the format constraint
       refuses: Crockford has no `l` and no `u`. Worth knowing before writing a
       literal by hand, and it is the alphabet doing its job. */
    const result = await admin.client
      .from("practitioners")
      .update({ handle: "bhadm1n0" } as never)
      .eq("id", profile.id)
      .select("handle")
      .single();

    expectAllowed(result);
    expect(result.data?.handle).toBe("bhadm1n0");
  });
});

describe("who may read it", () => {
  it("is readable by `anon`, or the directory cannot build a link", async () => {
    /* Named explicitly in the migration's grant. Without it the directory query
       returns `42501 permission denied` — Postgres checks the privilege before it
       evaluates row level security — and the failure reads as a broken policy
       rather than as a missing grant, which is the confusion AGENTS.md warns
       about and the reason this assertion exists at all. */
    const result = await anon.client
      .from("practitioners")
      .select("id, handle")
      .eq("id", mine)
      .single();

    expectAllowed(result);
    expect(result.data?.handle).toMatch(HANDLE);
    expect(result.data?.handle).toBe(await handleOf(mine));
  });

  it("is readable by a signed-in practitioner, who needs to know their own URL", async () => {
    const result = await practitioner.client
      .from("practitioners")
      .select("id, handle")
      .eq("id", mine)
      .single();

    expectAllowed(result);
    expect(result.data?.handle).toBe(await handleOf(mine));
  });
});

describe("who may write it", () => {
  it("refuses a practitioner writing their own", async () => {
    const before = await handleOf(mine);

    /* The row is theirs and `practitioners_update_own` would allow the update, so
       this refusal is the column privilege and nothing else: `handle` is absent
       from the `update` list `authenticated` holds, and PostgREST honours column
       privileges whatever the policies say. A mutable handle breaks every
       published link. */
    const result = await practitioner.client
      .from("practitioners")
      .update({ handle: "aaaaaaaa" } as never)
      .eq("id", mine);

    expectPermissionDenied(practitioner, result);
    expect(await handleOf(mine)).toBe(before);
  });

  it("refuses a practitioner choosing one on the way in", async () => {
    /* Absent from the `insert` grant too, which is what makes "practitioner-chosen
       handles are out of scope" a fact about the schema rather than a fact about
       the form. `/p/anthropic-official` is a real impersonation route on a product
       selling trust, and Bluehex owns the namespace the way it owns
       `credential_catalogue`. */
    const result = await practitioner.client
      .from("practitioners")
      .insert({
        contact_id: await seedContact(practitioner.userId),
        user_id: practitioner.userId,
        name: "Chose their own",
        handle: "aaaaaaaa",
      } as never);

    expectPermissionDenied(practitioner, result);
  });

  it("stays pinned when the column grant is restored by hand", async () => {
    const before = await handleOf(mine);

    /* The backstop, and the most valuable assertion in this file. The grant and
       the trigger are two mechanisms and neither is sufficient alone: a policy
       has no `OLD`, so "this row is yours to update, but this column must not
       change" is unsayable in row level security, and only `practitioners_guard`
       can state it. This is what catches a later migration re-granting the column
       by accident — the failure that fails open and silently, exactly as it would
       for `verified`. Written as a `grant` because there is no other way to
       express it; the harness's `sql()` seam exists for this. */
    await sql("grant update (handle) on public.practitioners to authenticated");
    try {
      const result = await practitioner.client
        .from("practitioners")
        .update({ handle: "aaaaaaaa" } as never)
        .eq("id", mine)
        .select("handle")
        .single();

      /* Accepted at the privilege layer now, and pinned by the trigger — which is
         why the assertion is on the value rather than on a status code. */
      expectAllowed(result);
      expect(result.data?.handle).toBe(before);
    } finally {
      await sql("revoke update (handle) on public.practitioners from authenticated");
    }
  });
});
