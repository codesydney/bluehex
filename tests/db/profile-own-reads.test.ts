import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { anonCaller, practitionerCaller, type Caller } from "./harness/callers";
import { expectAllowed, expectPermissionDenied } from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `my_profile()` and `my_credentials()` — the owner's read of their own rows.
 *
 * **These two functions are the only way a practitioner can fetch their own
 * profile, and the fixtures here are built to prove it rather than to assume
 * it.** The profile under test is `approved` on purpose. An owner whose profile
 * is still `pending` can isolate it from the client with `status <> 'approved'`,
 * so a fixture in that state would pass every assertion below while the function
 * did nothing — and would go on passing after Bluehex approved the person, at
 * which point the editor breaks in production. Approved is the case that fails
 * without the function.
 *
 * The second signed-in practitioner is the one that proves anything at all. An
 * assertion written from the owner passes identically whether the predicate
 * inside a `security definer` function is `p.user_id = auth.uid()` or `true`,
 * and `true` is the mistake that discloses every practitioner's private
 * certificate link at once. So every positive case here has a negative twin
 * asked from somebody else's account.
 *
 * The distinction those negatives turn on: a caller who owns nothing gets an
 * **empty result, not a refusal**. The function is theirs to execute; the rows
 * are not theirs to see. A refusal would mean the grant was wrong, and an
 * assertion that accepted either would not notice.
 */

let anon: Caller;
let owner: Caller;
let stranger: Caller;
/**
 * A signed-in account owning no profile at all. Distinct from `stranger`, who
 * owns one: a predicate that returned *something* to every signed-in caller
 * would still look correct from `stranger`, whose own row is what they expect
 * to see.
 */
let unowned: Caller;

/** The owner's profile: approved, so no client-side filter can isolate it. */
let mine: string;
/**
 * A curated profile with no owner — `user_id is null`, the state #14's claim
 * path exists to resolve. It is the row that `null = auth.uid()` is what keeps
 * private, and seeding it is the only reason that claim is under test rather
 * than merely asserted in a comment.
 */
let unclaimed: string;
/** A catalogue entry, because a credential must reference one. */
let entry: string;

/**
 * A private evidence link — `evidence_public = false`, which is the default and
 * the case that matters. The generated `evidence_url_public` masks it to null
 * for every reader, so if the owner cannot read the raw column back their edit
 * form silently drops it on the next submit.
 */
const privateEvidence = "https://certificates.example.invalid/harness-own-reads";

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  owner = await practitionerCaller("owner");
  stranger = await practitionerCaller("stranger");
  unowned = await practitionerCaller("unowned");

  mine = await seedProfile(owner.userId, "Harness own-reads owner");
  /* The stranger owns an approved profile too, so that a `true` predicate inside
     either function would show them the owner's row *and* show the owner theirs
     — the symmetric failure, caught from both sides. */
  await seedProfile(stranger.userId, "Harness own-reads stranger");
  unclaimed = await seedProfile(null, "Harness own-reads unclaimed");

  entry = await seedCatalogueEntry();
  await seedCredential(mine, entry, privateEvidence);
  /* The unclaimed profile holds a credential too, so the same widened predicate
     is caught on both functions rather than only on `my_profile()`. */
  await seedCredential(unclaimed, await seedCatalogueEntry(), privateEvidence);
});

afterAll(async () => {
  await sql(
    `delete from public.practitioner_credentials
      where catalogue_id in (select id from public.credential_catalogue
                              where label like 'harness own-reads%')`,
  );
  await sql(
    `delete from public.credential_catalogue where label like 'harness own-reads%'`,
  );
  await sql(`delete from public.practitioners where name like 'Harness own-reads%'`);
  await sql(
    `delete from public.practitioner_contacts where contact_email like 'harness-own-reads%'`,
  );
  /* No `deleteCreatedUsers()` here: `harness/setup.ts` calls it for every file in
     the project, and its afterAll runs after this one. */
});

describe("why the functions exist", () => {
  it("refuses the owner's own attempt to filter on user_id", async () => {
    /* The obvious query, and the one every reader tries first. `user_id` is not
       in the `authenticated` select grant, and Postgres checks column privileges
       on columns referenced in `WHERE` as well as in the select list — so this is
       refused before any policy is consulted. */
    const result = await owner.client
      .from("practitioners")
      .select("id")
      .eq("user_id", owner.userId!);

    expectPermissionDenied(owner, result);
  });

  it("leaves the owner unable to pick their own row out of the approved ones", async () => {
    /* `practitioners_read_own` and `practitioners_read_approved` are both
       permissive, so they OR. The owner sees their own row here — and also every
       other approved profile, with no granted column that separates them. */
    const visible = await owner.client.from("practitioners").select("id, status");
    expectAllowed(visible);
    expect(visible.data!.length).toBeGreaterThan(1);
    expect(visible.data!.every((row) => row.status === "approved")).toBe(true);

    /* The near-miss that looks like a fix: it returns exactly your own row while
       you are pending, and nothing at all the moment you are approved. */
    const trick = await owner.client
      .from("practitioners")
      .select("id")
      .neq("status", "approved");
    expectAllowed(trick);
    expect(trick.data).toHaveLength(0);
  });
});

describe("my_profile()", () => {
  it("returns the owner's own row, with the columns the table withholds", async () => {
    const result = await owner.client.rpc("my_profile");
    expectAllowed(result);

    expect(result.data).toHaveLength(1);
    const [profile] = result.data!;
    expect(profile!.id).toBe(mine);
    expect(profile!.status).toBe("approved");
    /* Both are absent from the `authenticated` select grant on the table, which
       is the whole reason the function exists. `contact_id` in particular: an
       abandoned earlier submission leaves a second contact row the same caller
       created, and this pointer is the only thing that says which is live. */
    expect(profile!.handle).toBeTruthy();
    expect(profile!.contact_id).toBeTruthy();
  });

  it("returns nothing to a signed-in caller who does not own the row", async () => {
    const result = await stranger.client.rpc("my_profile");

    /* Allowed, and empty of the owner's row — not refused. */
    expectAllowed(result);
    expect(result.data!.map((row) => row.id)).not.toContain(mine);
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.id).not.toBe(mine);
  });

  it("returns nothing at all to a signed-in caller who owns no profile", async () => {
    const result = await unowned.client.rpc("my_profile");

    expectAllowed(result);
    expect(result.data).toHaveLength(0);
  });

  it("never returns an unclaimed profile, to anybody", async () => {
    /* `user_id is null` on a curated profile, and `null = auth.uid()` is `null`
       rather than true — which is the entire reason a widened predicate would be
       catastrophic rather than merely wrong. A curated row is a real person's
       name and links, entered by Bluehex before they have an account. */
    for (const caller of [owner, stranger, unowned]) {
      const result = await caller.client.rpc("my_profile");
      expectAllowed(result);
      expect(
        result.data!.map((row) => row.id),
        `${caller.label} was shown the unclaimed profile`,
      ).not.toContain(unclaimed);
    }
  });

  it("refuses anon outright", async () => {
    expectPermissionDenied(anon, await anon.client.rpc("my_profile"));
  });
});

describe("my_credentials()", () => {
  it("returns the owner's own raw evidence_url", async () => {
    const result = await owner.client.rpc("my_credentials");
    expectAllowed(result);

    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.evidence_url).toBe(privateEvidence);
    expect(result.data![0]!.evidence_public).toBe(false);
  });

  it("returns nothing to a signed-in caller who does not own the credential", async () => {
    const result = await stranger.client.rpc("my_credentials");

    expectAllowed(result);
    expect(result.data).toHaveLength(0);
  });

  it("returns nothing at all to a signed-in caller who owns no profile", async () => {
    const result = await unowned.client.rpc("my_credentials");

    expectAllowed(result);
    expect(result.data).toHaveLength(0);
  });

  it("never returns an unclaimed profile's credentials, to anybody", async () => {
    for (const caller of [owner, stranger, unowned]) {
      const result = await caller.client.rpc("my_credentials");
      expectAllowed(result);
      expect(
        result.data!.map((row) => row.practitioner_id),
        `${caller.label} was shown the unclaimed profile's credentials`,
      ).not.toContain(unclaimed);
    }
  });

  it("refuses anon outright", async () => {
    expectPermissionDenied(anon, await anon.client.rpc("my_credentials"));
  });

  it("does not reopen the column grant it routes around", async () => {
    /* The assertion that catches a later migration "simplifying" this function
       away by granting the column instead. `credentials_read_public` shows every
       signed-in caller every credential on every approved profile, so a grant
       here would hand the stranger the owner's private link. */
    expectPermissionDenied(
      stranger,
      await stranger.client.from("practitioner_credentials").select("evidence_url"),
    );
    expectPermissionDenied(
      owner,
      await owner.client.from("practitioner_credentials").select("evidence_url"),
    );

    /* And the masked column still reads null for the stranger, which is what the
       raw one is standing in for. */
    const masked = await stranger.client
      .from("practitioner_credentials")
      .select("evidence_url_public")
      .eq("practitioner_id", mine);
    expectAllowed(masked);
    expect(masked.data).toHaveLength(1);
    expect(masked.data![0]!.evidence_url_public).toBeNull();
  });
});

/** Writes a contact as `postgres` and returns its id. */
let contacts = 0;
async function seedContact(): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ($1) returning id`,
    [`harness-own-reads-${contacts}@example.invalid`],
  );
  return row!.id;
}

/** Writes an approved, claimed profile as `postgres` and returns its id. */
async function seedProfile(userId: string | null, name: string): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, $3, 'approved'::public.practitioner_status) returning id`,
    [await seedContact(), userId, name],
  );
  return row!.id;
}

/**
 * Writes a catalogue entry as `postgres` and returns its id. Labels are counted
 * rather than constant: `unique (kind, platform, label)` refuses a second entry
 * with the same three, and the second caller here would otherwise fail in
 * `beforeAll`, which reports as every test in the file being skipped.
 */
let entries = 0;
async function seedCatalogueEntry(): Promise<string> {
  entries += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.credential_catalogue (kind, platform, label)
     values ('course', 'Anthropic Academy', $1) returning id`,
    [`harness own-reads entry ${entries}`],
  );
  return row!.id;
}

/**
 * Writes a credential as `postgres` with a private evidence link. Written as the
 * table owner rather than through the caller because the point of the fixture is
 * the column the caller cannot read.
 */
async function seedCredential(
  practitionerId: string,
  catalogueId: string,
  evidenceUrl: string,
): Promise<void> {
  await sql(
    `insert into public.practitioner_credentials
       (practitioner_id, catalogue_id, earned_at, evidence_url, evidence_public)
     values ($1, $2, '2026-01-15', $3, false)`,
    [practitionerId, catalogueId, evidenceUrl],
  );
}
