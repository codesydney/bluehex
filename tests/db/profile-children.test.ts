import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Json } from "@/lib/database.types";

import { adminCaller, anonCaller, practitionerCaller, type Caller } from "./harness/callers";
import {
  expectAllowed,
  expectPermissionDenied,
  expectSqlstate,
  sqlstate,
} from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `apply_profile_children()` — a save's whole effect on the two child tables, in
 * one transaction.
 *
 * **The assertion this file exists for is *rolls the credential removal back when
 * the services cap refuses the insert***: a plan whose services insert is refused
 * by `practitioner_services_cap` has to leave the credentials it asked to remove
 * exactly where they were. Split across separate PostgREST requests that failure
 * is reachable rather than contrived — the deletes commit, the cap raises, and the
 * practitioner is left holding fewer credentials than they started with, on the
 * table the Verified badge attests to.
 *
 * Everything else here exists because atomicity must not be bought with something
 * else, and the something else is `verified`. The function is `security invoker`
 * so that `credentials_guard` goes on seeing a caller it treats as unprivileged;
 * made `security definer` it would run as `postgres`, which is on that trigger's
 * allow-list, and the pin holding the attestation columns to `OLD` would quietly
 * stop applying. Nothing would look different from the owner's side, which is why
 * several of these are written around the badge rather than around the rows.
 *
 * The second signed-in practitioner is not padding. The function names rows by id
 * and takes no profile id at all, so what keeps a payload off somebody else's rows
 * is row level security, `my_profile()` and the `profile_id` bound on every
 * statement — and an assertion written from the owner passes identically whether
 * any of the three is doing anything.
 *
 * **The admin is the caller who separates them.** `credentials_admin_all` and
 * `services_admin_all` are `using (true)`, so row level security narrows nothing
 * for an admin and the bound is the only thing left. Everything a practitioner is
 * asked here would pass with the bound deleted; the admin cases would not. A
 * function granted to `authenticated` and to `bluehex_admin` behaves as two
 * different things, and a file that only ever asked the practitioner would state
 * the practitioner's answer as the function's.
 */

let anon: Caller;
let owner: Caller;
let stranger: Caller;
/** A signed-in account owning no profile, which is the only way to reach `P0002`. */
let unowned: Caller;
/** An admin who is also a practitioner, because every admin here is both. */
let admin: Caller;

/** The owner's profile: approved, and the subject of most of this file. */
let mine: string;
/** The second practitioner's, so the ownership rules have something to refuse. */
let theirs: string;
/** The admin's own, which is where `my_profile()` sends their inserts. */
let adminsOwn: string;

/** Credential catalogue entries. Three, because a repoint needs somewhere to go. */
let entryA: string;
let entryB: string;
let entryC: string;
/** Service catalogue entries. Four, because a cap of three needs a fourth to refuse. */
let serviceA: string;
let serviceB: string;
let serviceC: string;
let serviceD: string;

const evidence = "https://certificates.example.invalid/harness-children";

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  owner = await practitionerCaller("owner");
  stranger = await practitionerCaller("stranger");
  unowned = await practitionerCaller("unowned");
  admin = await adminCaller("admin");

  mine = await seedProfile(owner.userId, "Harness children owner");
  theirs = await seedProfile(stranger.userId, "Harness children stranger");
  adminsOwn = await seedProfile(admin.userId, "Harness children admin");

  entryA = await seedCatalogueEntry();
  entryB = await seedCatalogueEntry();
  entryC = await seedCatalogueEntry();
  serviceA = await seedServiceEntry();
  serviceB = await seedServiceEntry();
  serviceC = await seedServiceEntry();
  serviceD = await seedServiceEntry();
});

/* Both child tables, for both profiles. Every test builds the state it needs from
   nothing, because what most of them assert is the state left behind. */
afterEach(async () => {
  await sql(
    "delete from public.practitioner_credentials where practitioner_id = any($1::uuid[])",
    [[mine, theirs, adminsOwn]],
  );
  await sql(
    "delete from public.practitioner_services where practitioner_id = any($1::uuid[])",
    [[mine, theirs, adminsOwn]],
  );
});

afterAll(async () => {
  await sql("delete from public.practitioners where name like 'Harness children%'");
  await sql(
    "delete from public.practitioner_contacts where contact_email like 'harness-children-%'",
  );
  await sql("delete from public.credential_catalogue where label like 'harness children%'");
  await sql("delete from public.service_catalogue where label like 'harness children%'");
  /* No `deleteCreatedUsers()`: `harness/setup.ts` calls it for every file in the
     project, and its afterAll runs after this one. */
});

describe("one call, one transaction", () => {
  it("applies removals, updates and inserts together", async () => {
    const dropped = await seedCredential(mine, entryA);
    const edited = await seedCredential(mine, entryB);
    const goneService = await seedService(mine, serviceA);

    const result = await apply(owner, {
      credential_removals: [dropped],
      credential_updates: [
        {
          id: edited,
          catalogue_id: entryB,
          earned_at: "2026-03-04",
          evidence_url: evidence,
          evidence_public: true,
        },
      ],
      credential_inserts: [
        {
          catalogue_id: entryC,
          earned_at: "2026-05-06",
          evidence_url: null,
          evidence_public: false,
        },
      ],
      service_removals: [goneService],
      service_inserts: [serviceB],
    });

    expectAllowed(result);
    expect(await credentialsOf(owner)).toEqual([
      { catalogue_id: entryB, earned_at: "2026-03-04", verified: false, verified_at: null },
      { catalogue_id: entryC, earned_at: "2026-05-06", verified: false, verified_at: null },
    ]);
    expect(await servicesOf(owner, mine)).toEqual([serviceB]);

    /* `evidence_url` is expanded as `public.https_url` in the function's record
       definition rather than as text, so this is also the assertion that the
       domain survives `jsonb_to_recordset` — and that a link the practitioner
       typed reaches the column it was typed for. */
    const saved = await mineCredentials(owner);
    expect(saved.find((row) => row.catalogue_id === entryB)).toMatchObject({
      evidence_url: evidence,
      evidence_public: true,
    });
  });

  it("rolls the credential removal back when the services cap refuses the insert", async () => {
    /* Deletes run first inside the function, so by the time the fourth service is
       refused the credential is gone as far as this transaction is concerned, and
       it has to come back. Verified on purpose: what a save that committed its
       deletes and then failed would destroy is a check Bluehex performed. */
    const checked = await seedCredential(mine, entryA, { verified: true });
    await seedService(mine, serviceA);
    await seedService(mine, serviceB);

    const result = await apply(owner, {
      credential_removals: [checked],
      service_inserts: [serviceC, serviceD],
    });

    expectSqlstate(result, sqlstate.checkViolation);
    expect(await credentialsOf(owner)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
    expect(await servicesOf(owner, mine)).toEqual([serviceA, serviceB].sort());
  });

  it("does nothing when every pile is empty", async () => {
    await seedCredential(mine, entryA, { verified: true });
    await seedService(mine, serviceA);

    /* A save that changed only the profile itself still calls this, so an empty
       plan is the ordinary case rather than an edge one. */
    expectAllowed(await apply(owner, {}));

    expect(await credentialsOf(owner)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
    expect(await servicesOf(owner, mine)).toEqual([serviceA]);
  });
});

describe("what the badge attests to", () => {
  it("leaves a credential the plan does not name alone, timestamp included", async () => {
    await seedCredential(mine, entryA, { verified: true });
    const before = await updatedAtOf(owner, entryA);

    /* The pin, which is what `security definer` would have switched off. Inserting
       a *different* credential in the same call is what makes this a test of the
       trigger rather than of the plan: the transaction writes the table, and the
       untouched row has to come through it unmarked. */
    expectAllowed(
      await apply(owner, {
        credential_inserts: [
          {
            catalogue_id: entryB,
            earned_at: "2026-02-02",
            evidence_url: null,
            evidence_public: false,
          },
        ],
      }),
    );

    expect(await credentialsOf(owner)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
      { catalogue_id: entryB, earned_at: "2026-02-02", verified: false, verified_at: null },
    ]);
    /* `updated_at` is the only signal that a row was written at all, and it is
       served to the owner — a timestamp that moves whenever somebody saves an
       unrelated credential answers "when did this last change" wrongly. */
    expect(await updatedAtOf(owner, entryA)).toBe(before);
  });

  it("clears verification when the plan edits the claim", async () => {
    const checked = await seedCredential(mine, entryA, { verified: true });

    expectAllowed(
      await apply(owner, {
        credential_updates: [
          {
            id: checked,
            catalogue_id: entryA,
            earned_at: "2026-07-08",
            evidence_url: null,
            evidence_public: false,
          },
        ],
      }),
    );

    /* `credentials_guard`'s clearing rule, reached through the RPC. The date is
       part of what Bluehex checked, so the check stops being asserted and the
       provenance goes with it rather than pointing at an admin who looked at
       something else. */
    expect(await credentialsOf(owner)).toEqual([
      { catalogue_id: entryA, earned_at: "2026-07-08", verified: false, verified_at: null },
    ]);
  });

  it("keeps verification when an update rewrites the same values", async () => {
    const checked = await seedCredential(mine, entryA, { verified: true });

    /* `planCredentials` keeps an unchanged row out of the update pile, so this is
       not a call the editor makes. It is asserted anyway because the guard
       compares with `is distinct from`, and that is the layer that still holds if
       the plan is ever rewritten. */
    expectAllowed(
      await apply(owner, {
        credential_updates: [
          {
            id: checked,
            catalogue_id: entryA,
            earned_at: "2026-01-15",
            evidence_url: null,
            evidence_public: false,
          },
        ],
      }),
    );

    expect(await credentialsOf(owner)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
  });

  it("ignores an attestation somebody puts in the payload", async () => {
    /* The record definition names the columns it expands and `verified` is not
       among them, so an extra key in the JSON is dropped before Postgres ever
       sees it — and the column grants and the guard are both still behind that.
       Asserted from the outcome, because the outcome is what makes deleting and
       re-adding a credential a way to lose a badge rather than a way to mint one. */
    expectAllowed(
      await apply(owner, {
        credential_inserts: [
          {
            catalogue_id: entryA,
            earned_at: "2026-01-15",
            evidence_url: null,
            evidence_public: false,
            verified: true,
          },
        ],
      }),
    );

    expect(await credentialsOf(owner)).toEqual([
      { catalogue_id: entryA, earned_at: "2026-01-15", verified: false, verified_at: null },
    ]);
  });
});

describe("rows the caller does not own", () => {
  it("removes nothing when the removal names another practitioner's credential", async () => {
    const notMine = await seedCredential(theirs, entryA, { verified: true });

    /* Silently, and that is the answer rather than a compromise. Two things narrow
       the delete here and either would do it alone: `credentials_rw_own`, and the
       `profile_id` bound on the statement. Refusing instead would mean the function
       had looked the row up, which is a thing a stranger should not be able to make
       it do. */
    expectAllowed(await apply(owner, { credential_removals: [notMine] }));

    expect(await credentialsOf(stranger)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
  });

  it("changes nothing when an update names another practitioner's credential", async () => {
    const notMine = await seedCredential(theirs, entryA, { verified: true });

    /* The update is the statement with the quietest failure of the four. A removal
       that reaches too far leaves a missing row and an insert leaves an extra one,
       but an update that reaches too far leaves a row that still looks right to
       everyone except its owner — and this plan asks for the two changes that would
       hurt most: `earned_at`, which `credentials_guard` clears the check on, and
       `evidence_public`, which it does not, so that half would move silently. */
    expectAllowed(
      await apply(owner, {
        credential_updates: [
          {
            id: notMine,
            catalogue_id: entryA,
            earned_at: "2027-12-31",
            evidence_url: evidence,
            evidence_public: true,
          },
        ],
      }),
    );

    expect(await credentialsOf(stranger)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
    expect((await mineCredentials(stranger))[0]).toMatchObject({
      evidence_url: null,
      evidence_public: false,
    });
  });

  it("leaves another practitioner's services alone", async () => {
    const notMine = await seedService(theirs, serviceA);

    expectAllowed(await apply(owner, { service_removals: [notMine] }));

    expect(await servicesOf(stranger, theirs)).toEqual([serviceA]);
  });

  it("inserts onto the caller's own profile and no other", async () => {
    /* There is no profile id in the payload to get wrong. `my_profile()` answers
       for whoever is asking, so an identical call from the stranger lands on their
       own row — which is the whole of why this function takes no argument naming a
       practitioner. */
    expectAllowed(
      await apply(stranger, {
        credential_inserts: [
          {
            catalogue_id: entryA,
            earned_at: "2026-01-15",
            evidence_url: null,
            evidence_public: false,
          },
        ],
        service_inserts: [serviceA],
      }),
    );

    expect(await credentialsOf(stranger)).toHaveLength(1);
    expect(await credentialsOf(owner)).toHaveLength(0);
    expect(await servicesOf(stranger, theirs)).toEqual([serviceA]);
    expect(await servicesOf(owner, mine)).toEqual([]);
  });

  it("does not reach a service row the editor could not have drawn", async () => {
    /* The free-text row an admin wrote during curated intake. This form has no
       control that produces one, so a function reconciling against the desired
       state would read its absence as a removal and delete it on the first save of
       an unrelated field. Naming the rows to remove is what makes that
       unreachable, and this is what holds the signature to it. */
    await sql(
      `insert into public.practitioner_services (practitioner_id, label)
       values ($1, 'Rescuing agent runs at 2am')`,
      [mine],
    );
    const chip = await seedService(mine, serviceA);

    expectAllowed(await apply(owner, { service_removals: [chip], service_inserts: [serviceB] }));

    const left = await owner.client
      .from("practitioner_services")
      .select("catalogue_id, label")
      .eq("practitioner_id", mine)
      .order("created_at");
    expectAllowed(left);
    expect(left.data).toEqual([
      { catalogue_id: null, label: "Rescuing agent runs at 2am" },
      { catalogue_id: serviceB, label: null },
    ]);
  });
});

/**
 * The caller the `profile_id` bound on each statement is written for.
 *
 * A practitioner's answers hold with or without it, because `credentials_rw_own`
 * and `services_rw_own` have already narrowed the statement to rows they own. An
 * admin is the caller who would reach further, so **the three cases below that name
 * another profile's rows are the only assertions in this file that fail if the bound
 * is dropped** — one per bounded statement, because dropping it from any one of the
 * three would otherwise cost nothing. The insert case is the one that never needed
 * it: a new row carries `profile_id` because it has to belong to somebody, so it has
 * always landed on the caller's own profile.
 */
describe("an admin, whom the policies would otherwise let reach further", () => {
  it("removes nothing from another practitioner's profile", async () => {
    const notMine = await seedCredential(theirs, entryA, { verified: true });

    expectAllowed(await apply(admin, { credential_removals: [notMine] }));

    expect(await credentialsOf(stranger)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
  });

  it("removes nothing from another practitioner's services either", async () => {
    const notMine = await seedService(theirs, serviceA);

    /* The same bound on the other table, and the statement that would go unnoticed
       longest without it. A service carries no attestation, so nothing clears and
       nothing is stamped: the row is simply gone from a profile nobody was editing,
       and the only trace is what the directory stops showing. */
    expectAllowed(await apply(admin, { service_removals: [notMine] }));

    expect(await servicesOf(stranger, theirs)).toEqual([serviceA]);
  });

  it("changes nothing on another practitioner's credential with an update", async () => {
    const notMine = await seedCredential(theirs, entryA, { verified: true });

    /* The statement that leaves the least behind to notice it by, which is why the
       bound matters most here. A removal that reached too far would leave a missing
       row and an insert an extra one; this would leave the row where it was, holding
       a claim its owner never made. The plan asks for both kinds of damage at once:
       `earned_at`, which `credentials_guard` clears the check on, and
       `evidence_public`, which it does not — so that half would move with nothing on
       the row to show that it had, and what it governs is whether a certificate
       carrying somebody's full legal name is served to every signed-in caller. */
    expectAllowed(
      await apply(admin, {
        credential_updates: [
          {
            id: notMine,
            catalogue_id: entryA,
            earned_at: "2029-09-09",
            evidence_url: null,
            evidence_public: true,
          },
        ],
      }),
    );

    expect(await credentialsOf(stranger)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
    expect((await mineCredentials(stranger))[0]).toMatchObject({ evidence_public: false });
  });

  it("still inserts onto its own profile and no other", async () => {
    await seedCredential(theirs, entryA, { verified: true });

    /* The half that holds for every caller, and the reason the signature takes no
       practitioner id: `profile_id` comes from `my_profile()`, so there is nothing
       in the payload that names whose profile gains a row. An admin can write onto
       a stranger's profile over PostgREST and cannot do it through here, which is
       the property a later change adding an id argument would remove. */
    expectAllowed(
      await apply(admin, {
        credential_inserts: [
          {
            catalogue_id: entryB,
            earned_at: "2026-04-04",
            evidence_url: null,
            evidence_public: false,
          },
        ],
        service_inserts: [serviceA],
      }),
    );

    expect(await credentialsOf(admin)).toEqual([
      { catalogue_id: entryB, earned_at: "2026-04-04", verified: false, verified_at: null },
    ]);
    expect(await servicesOf(admin, adminsOwn)).toEqual([serviceA]);
    expect(await servicesOf(stranger, theirs)).toEqual([]);
    expect(await credentialsOf(stranger)).toEqual([
      {
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
  });
});

describe("who may call it", () => {
  it("refuses anon", async () => {
    expectPermissionDenied(anon, await apply(anon, {}));
  });

  it("refuses a signed-in account that has no profile", async () => {
    /* `P0002` is `no_data_found`, which `approve_practitioner()` already raises
       for the same shape of question. Only reachable if the profile went away
       between the two requests a save makes, and asserted so that the answer stays
       an error rather than becoming a silent write onto nothing. */
    expectSqlstate(await apply(unowned, {}), "P0002");
  });
});

describe("the refusals a save has to explain", () => {
  it("raises the services cap with its own message", async () => {
    await seedService(mine, serviceA);
    await seedService(mine, serviceB);
    await seedService(mine, serviceC);

    const result = await apply(owner, { service_inserts: [serviceD] });

    /* `refusal()` in `src/app/profile/_lib/actions.ts` passes this message through
       to the practitioner, so the wording surviving the RPC is what stops the form
       falling back to a constraint name nobody can act on. */
    expectSqlstate(result, sqlstate.checkViolation);
    expect(result.error!.message).toContain("at most three services");
  });

  it("raises a unique violation naming the credentials constraint", async () => {
    /* Removing something in the same call, so the rollback is asserted on a second
       sqlstate as well as on the cap. It follows from the transaction and proves
       nothing new about Postgres — but what this function exists to prevent is a
       delete that commits ahead of a refusal, and a test naming one constraint
       holds only until the next constraint arrives. */
    const kept = await seedCredential(mine, entryB, { verified: true });

    const result = await apply(owner, {
      credential_removals: [kept],
      credential_inserts: [
        {
          catalogue_id: entryA,
          earned_at: "2026-01-15",
          evidence_url: null,
          evidence_public: false,
        },
        {
          catalogue_id: entryA,
          earned_at: "2026-02-02",
          evidence_url: null,
          evidence_public: false,
        },
      ],
    });

    /* `refusal()` branches on the constraint name rather than on the code, because
       three of them are reachable from one save and they mean different things to
       the person reading. This is the branch that turns a duplicate into a
       sentence. */
    expectSqlstate(result, sqlstate.uniqueViolation);
    expect(result.error!.message).toContain("practitioner_credentials_");
    expect(await credentialsOf(owner)).toEqual([
      {
        catalogue_id: entryB,
        earned_at: "2026-01-15",
        verified: true,
        verified_at: expect.any(String),
      },
    ]);
  });
});

/** The plan, as `apply_profile_children()` takes it. Every pile defaults to empty. */
type Plan = {
  credential_removals?: string[];
  credential_updates?: Json[];
  credential_inserts?: Json[];
  service_removals?: string[];
  service_inserts?: string[];
};

function apply(caller: Caller, plan: Plan) {
  return caller.client.rpc("apply_profile_children", {
    credential_removals: plan.credential_removals ?? [],
    credential_updates: plan.credential_updates ?? [],
    credential_inserts: plan.credential_inserts ?? [],
    service_removals: plan.service_removals ?? [],
    service_inserts: plan.service_inserts ?? [],
  });
}

/**
 * The caller's own credentials, through `my_credentials()`. **Through a caller
 * rather than through `sql()`**: `postgres` bypasses every policy, so re-reading a
 * row as the table's owner would prove nothing about what was decided.
 */
async function mineCredentials(caller: Caller) {
  const result = await caller.client.rpc("my_credentials");
  expectAllowed(result);
  return result.data!;
}

/** The same rows, reduced to what these tests are about and ordered for comparison. */
async function credentialsOf(caller: Caller) {
  return (await mineCredentials(caller))
    .map((row) => ({
      catalogue_id: row.catalogue_id,
      earned_at: row.earned_at,
      verified: row.verified,
      /* Cast because the generator types every column of a `returns table`
         function as non-nullable, which `verified_at` is not — the #14 read
         functions carry the same caveat. */
      verified_at: row.verified_at as string | null,
    }))
    .sort((a, b) => a.earned_at.localeCompare(b.earned_at));
}

/** One credential's `updated_at`, keyed by catalogue entry because the row id is not
    what a test holds when it is asserting that the row was left alone. */
async function updatedAtOf(caller: Caller, catalogueId: string): Promise<string> {
  const rows = await mineCredentials(caller);
  return rows.find((row) => row.catalogue_id === catalogueId)!.updated_at;
}

/** A profile's catalogue services, read through a caller and sorted for comparison. */
async function servicesOf(caller: Caller, practitionerId: string): Promise<string[]> {
  const result = await caller.client
    .from("practitioner_services")
    .select("catalogue_id")
    .eq("practitioner_id", practitionerId);
  expectAllowed(result);
  return result.data!.map((row) => row.catalogue_id!).sort();
}

/** Writes a contact row as `postgres` and returns its id. */
let contacts = 0;
async function seedContact(): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ($1) returning id`,
    [`harness-children-${contacts}-${Date.now()}@bluehex.test`],
  );
  return row!.id;
}

/** Writes a profile as `postgres`. Set-up is SQL; every assertion is a caller. */
async function seedProfile(userId: string | null, name: string): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, $3, 'approved'::public.practitioner_status) returning id`,
    [await seedContact(), userId, name],
  );
  return row!.id;
}

/**
 * Writes a credential catalogue entry. Counted rather than constant, because
 * `unique (kind, platform, label)` refuses a second entry with the same three and a
 * duplicate in `beforeAll` reports as every test in the file being skipped.
 */
let entries = 0;
async function seedCatalogueEntry(): Promise<string> {
  entries += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.credential_catalogue (kind, platform, label)
     values ('course', 'Anthropic Academy', $1) returning id`,
    [`harness children entry ${entries}`],
  );
  return row!.id;
}

/** Writes a service catalogue entry. `label` is unique there, so it is counted too. */
let serviceEntries = 0;
async function seedServiceEntry(): Promise<string> {
  serviceEntries += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.service_catalogue (label, sort_order)
     values ($1, $2) returning id`,
    [`harness children service ${serviceEntries}`, 100 + serviceEntries],
  );
  return row!.id;
}

/**
 * Writes a credential as `postgres`, optionally already verified.
 *
 * `verified` cannot be set through a caller at all — that is the point of the
 * column — so the fixture for every badge assertion here has to be built as
 * `postgres`, which `credentials_guard` treats as privileged. It stamps
 * `verified_at` on the way in; `verified_by` stays null, because there is no
 * `auth.uid()` on a direct connection.
 */
async function seedCredential(
  practitionerId: string,
  catalogueId: string,
  options: { verified?: boolean } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_credentials
       (practitioner_id, catalogue_id, earned_at, verified)
     values ($1, $2, '2026-01-15', $3) returning id`,
    [practitionerId, catalogueId, options.verified ?? false],
  );
  return row!.id;
}

/** Writes a catalogue service row as `postgres` and returns its id. */
async function seedService(practitionerId: string, catalogueId: string): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_services (practitioner_id, catalogue_id)
     values ($1, $2) returning id`,
    [practitionerId, catalogueId],
  );
  return row!.id;
}
