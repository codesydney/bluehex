import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { practitionerCaller, type Caller } from "./harness/callers";
import { expectAllowed } from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `practitioners.updated_at` as the revision a save is checked against.
 *
 * `saveProfileAction` conditions the profile update on `.eq("updated_at", …)`
 * with the value `my_profile()` served, and treats zero rows as "this profile
 * changed since you opened it". That is the whole of #129's control, and it
 * rests on three facts about the column and PostgREST that only a stack can
 * confirm:
 *
 *   1. the value comes back with fractional seconds, and goes back unchanged —
 *      a token that was rounded on the way is a token that never matches;
 *   2. a fresh token matches exactly one row: `updated_at` is in the
 *      `authenticated` select grant, so it may appear in a `WHERE`, and the
 *      policy still finds the caller's own row through it;
 *   3. a token the row has moved past matches nothing, and the update writes
 *      nothing — `practitioners_guard` moves the column on every update, so
 *      "moved past" is every save that landed since the read.
 *
 * The fourth case is the trap `SaveProfile`'s docstring warns about: the same
 * token through `new Date()` matches nothing, even while it is fresh.
 */

let owner: Caller;
let mine: string;

beforeAll(async () => {
  owner = await practitionerCaller("revision-owner");
  const [contact] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ('harness-revision@example.invalid') returning id`,
  );
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, 'Harness revision owner', 'approved'::public.practitioner_status)
     returning id`,
    [contact!.id, owner.userId],
  );
  mine = row!.id;
});

afterAll(async () => {
  await sql(`delete from public.practitioners where name = 'Harness revision owner'`);
  await sql(
    `delete from public.practitioner_contacts where contact_email = 'harness-revision@example.invalid'`,
  );
});

/** The revision as the editor receives it: `updated_at` off `my_profile()`. */
async function revision(): Promise<string> {
  const read = await owner.client.rpc("my_profile");
  expectAllowed(read);
  const row = (read.data as unknown as { id: string; updated_at: string }[]).find(
    (candidate) => candidate.id === mine,
  );
  expect(row).toBeDefined();
  return row!.updated_at;
}

function fractionDigits(token: string): number {
  return token.match(/\.(\d+)/)?.[1].length ?? 0;
}

function update(bio: string, token: string) {
  return owner.client
    .from("practitioners")
    .update({ bio })
    .eq("id", mine)
    .eq("updated_at", token)
    .select("id,updated_at")
    .maybeSingle();
}

describe("updated_at as the revision a save is checked against", () => {
  it("is served with fractional seconds", async () => {
    /* Six digits is the column's precision; PostgREST does not round it. */
    expect(await revision()).toMatch(/\.\d{1,6}[+-]\d\d:\d\d$/);
  });

  it("matches exactly one row while it is fresh, and moves when the row is written", async () => {
    const fresh = await revision();
    const result = await update("first", fresh);
    expectAllowed(result);
    expect(result.data).not.toBeNull();
    expect(result.data!.updated_at).not.toBe(fresh);
  });

  it("matches nothing once the row has moved past it, and writes nothing", async () => {
    const stale = await revision();

    /* The other tab's save. */
    const other = await update("second", stale);
    expect(other.data).not.toBeNull();

    const refused = await update("third", stale);
    expect(refused.error).toBeNull();
    expect(refused.data).toBeNull();

    const [row] = await sql<{ bio: string }>(`select bio from public.practitioners where id = $1`, [
      mine,
    ]);
    expect(row!.bio).toBe("second");
  });

  it("matches nothing after a trip through Date, even when it is fresh", async () => {
    /* Postgres trims trailing zeros, so once in a thousand ticks the value has
       three digits or fewer and rounds losslessly. Write the row again until it
       does not, rather than let the case pass by luck. */
    let fresh = await revision();
    for (let tick = 0; tick < 5 && fractionDigits(fresh) <= 3; tick += 1) {
      await update("tick", fresh);
      fresh = await revision();
    }
    expect(fractionDigits(fresh)).toBeGreaterThan(3);

    const rounded = new Date(fresh).toISOString();
    const result = await update("fourth", rounded);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });
});
