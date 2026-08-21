import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
 * `practitioner_services` — what a practitioner offers, capped at three.
 *
 * The one child table with no guard trigger, because it carries no attested
 * column: a practitioner rewriting what they sell is ordinary editing, exactly
 * like `bio`. So the file divides differently from `credentials.test.ts`. What is
 * under test here is the *shape* of a row — the "or" between a catalogue entry and
 * a label, which is a constraint rather than a convention — and the cap, which is
 * the mechanism that argued for a child table over two array columns and is the
 * one rule a form cannot be trusted with.
 *
 * Two assertions in here are the ones that catch a plausible-looking trigger. The
 * cap counting the row being updated makes a profile uneditable the moment it
 * reaches three, and a whitespace check written with the one-argument `btrim`
 * accepts a label of a single tab — both are invisible until somebody meets them,
 * so both are written from the failing side.
 */

let anon: Caller;
let practitioner: Caller;
let otherPractitioner: Caller;
let admin: Caller;

/** The practitioner's own profile: approved, claimed, and the subject of most of this file. */
let mine: string;
/** The second practitioner's, so row level security has something to refuse. */
let theirs: string;
/** Four catalogue services, because the cap needs a fourth to refuse. */
let serviceA: string;
let serviceB: string;
let serviceC: string;
let serviceD: string;

/* Rows a test made. Services go first: `on delete restrict` on `catalogue_id`
   means a listed catalogue entry cannot be deleted, which is a rule under test
   below and would otherwise make this sweep fail. */
afterEach(async () => {
  await sql("delete from public.practitioner_services where practitioner_id = any($1::uuid[])", [
    [mine, theirs],
  ]);
  await sql("delete from public.practitioners where name like 'harness %'");
  await sql(
    `delete from public.practitioner_contacts c
      where c.contact_email like 'harness-%'
        and not exists (select 1 from public.practitioners p where p.contact_id = c.id)`,
  );
  /* Restored rather than asserted around: one test retires a fixture entry, and a
     leaked `active = false` would make the read assertions pass for the wrong
     reason. */
  await sql(
    "update public.service_catalogue set active = true where label like 'harness service %' and not active",
  );
});

/**
 * The file's own fixtures, which `afterEach` deliberately leaves alone.
 *
 * `service_catalogue.label` is unique, so a run that leaks these makes the *next*
 * run fail in `beforeAll` — as a duplicate key on a label nobody typed, with every
 * test in the file reported **skipped** rather than failed. Deleting the profiles
 * first is what makes the catalogue rows deletable at all.
 */
afterAll(async () => {
  await sql("delete from public.practitioners where id = any($1::uuid[])", [[mine, theirs]]);
  await sql("delete from public.service_catalogue where id = any($1::uuid[])", [
    [serviceA, serviceB, serviceC, serviceD],
  ]);
  await sql(
    "delete from public.practitioner_contacts where contact_email like 'harness-services-%'",
  );
});

/** Writes a contact row as `postgres` and returns its id. */
let contacts = 0;
async function seedContact(): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ($1) returning id`,
    [`harness-services-${contacts}-${Date.now()}@bluehex.test`],
  );
  return row!.id;
}

/** Writes a profile as `postgres`. Set-up is SQL; every assertion is a caller. */
async function seedProfile(
  options: {
    userId?: string | null;
    status?: string;
    name?: string;
  } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, $3, $4::public.practitioner_status) returning id`,
    [
      await seedContact(),
      options.userId ?? null,
      options.name ?? "harness profile",
      options.status ?? "approved",
    ],
  );
  return row!.id;
}

/** Writes a catalogue service as `postgres` and returns its id. */
let entries = 0;
async function seedServiceEntry(label: string): Promise<string> {
  entries += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.service_catalogue (label, sort_order)
     values ($1, $2) returning id`,
    [`harness service ${label} ${entries}`, 100 + entries],
  );
  return row!.id;
}

/** Writes a service row as `postgres`, so a test can arrive at the cap without spending requests. */
async function seedService(
  practitionerId: string,
  kind: { catalogueId: string } | { label: string },
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_services (practitioner_id, catalogue_id, label)
     values ($1, $2, $3) returning id`,
    [
      practitionerId,
      "catalogueId" in kind ? kind.catalogueId : null,
      "catalogueId" in kind ? null : kind.label,
    ],
  );
  return row!.id;
}

/** Reads a profile's services back **through a caller**, so a policy is exercised rather than bypassed. */
async function servicesThrough(caller: Caller, practitionerId: string) {
  const result = await caller.client
    .from("practitioner_services")
    .select("id, catalogue_id, label")
    .eq("practitioner_id", practitionerId);

  expectAllowed(result);
  return result.data ?? [];
}

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  practitioner = await practitionerCaller("practitioner");
  otherPractitioner = await practitionerCaller("other practitioner");
  admin = await adminCaller("admin");

  mine = await seedProfile({ userId: practitioner.userId, name: "Fixture owner" });
  theirs = await seedProfile({
    userId: otherPractitioner.userId,
    name: "Fixture stranger",
  });

  serviceA = await seedServiceEntry("A");
  serviceB = await seedServiceEntry("B");
  serviceC = await seedServiceEntry("C");
  serviceD = await seedServiceEntry("D");
});

describe("the owner", () => {
  it("lists a catalogue service and a custom one on their own profile", async () => {
    const catalogue = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, catalogue_id: serviceA });
    const custom = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "Rescuing agent runs at 2am" });

    /* Both kinds are the practitioner's to write. Only the first filters — the
       catalogue is Bluehex's, and a custom label never becomes a chip. */
    expectAllowed(catalogue);
    expectAllowed(custom);
    expect(await servicesThrough(practitioner, mine)).toHaveLength(2);
  });

  it("can edit and remove what they offer", async () => {
    const row = await seedService(mine, { catalogueId: serviceA });

    const repointed = await practitioner.client
      .from("practitioner_services")
      .update({ catalogue_id: serviceB })
      .eq("id", row);
    const custom = await seedService(mine, { label: "Something else" });
    const removed = await practitioner.client
      .from("practitioner_services")
      .delete()
      .eq("id", custom);

    expectAllowed(repointed);
    expectAllowed(removed);
    expect(await servicesThrough(practitioner, mine)).toEqual([
      { id: row, catalogue_id: serviceB, label: null },
    ]);
  });

  it("cannot write the timestamps, or move a service to another profile", async () => {
    const stale = "2001-01-01T00:00:00Z";
    const row = await seedService(mine, { catalogueId: serviceA });

    const bornStale = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, catalogue_id: serviceB, created_at: stale });
    const backdated = await practitioner.client
      .from("practitioner_services")
      .update({ updated_at: stale })
      .eq("id", row);
    const reparented = await practitioner.client
      .from("practitioner_services")
      .update({ practitioner_id: theirs })
      .eq("id", row);

    /* All three columns are absent from the grant lists, so each write is refused
       at the privilege layer before any policy runs. `practitioner_id` is the one
       worth naming: moving a service between profiles is not editing, it is the row
       changing whose it is, and `services_rw_own`'s `with check` is not the place to
       discover that. */
    expectPermissionDenied(practitioner, bornStale);
    expectPermissionDenied(practitioner, backdated);
    expectPermissionDenied(practitioner, reparented);
  });
});

describe("what a service row may say", () => {
  it("refuses a row naming both a catalogue entry and a label", async () => {
    const result = await practitioner.client.from("practitioner_services").insert({
      practitioner_id: mine,
      catalogue_id: serviceA,
      label: "One-to-one tutoring, but mine",
    });

    /* The "or" is the table's whole shape: a row naming both would be filterable
       and free text at once. */
    expectSqlstate(result, sqlstate.checkViolation);
  });

  it("refuses a row naming neither", async () => {
    const result = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine });

    expectSqlstate(result, sqlstate.checkViolation);
  });

  it("refuses a whitespace-only label, a single tab included", async () => {
    /* A tab and a newline rather than spaces, and that is the point of the
       assertion: `btrim` with one argument strips spaces only, so a constraint
       written that way passes a spaces-only test and accepts `E'\t'` in
       production. The constraint is `label ~ '[^[:space:]]'` for this reason. */
    for (const label of ["", " ", "\t", "\n", " \t\n "]) {
      const result = await practitioner.client
        .from("practitioner_services")
        .insert({ practitioner_id: mine, label });

      expectSqlstate(result, sqlstate.checkViolation);
    }

    const real = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "\tCode review\n" });

    expectAllowed(real);
  });

  it("refuses the same catalogue service twice, and lets two people list one", async () => {
    await seedService(mine, { catalogueId: serviceA });

    const again = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, catalogue_id: serviceA });
    const somebodyElse = await otherPractitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: theirs, catalogue_id: serviceA });

    expectSqlstate(again, sqlstate.uniqueViolation);
    /* The half a unique constraint written one column short would break, and it is
       the normal case: a catalogue service exists to be offered by many people. */
    expectAllowed(somebodyElse);
  });

  it("accepts two custom labels that differ only in case or spacing", async () => {
    /* Deliberate rather than an omission. `unique (practitioner_id, catalogue_id)`
       permits any number of null `catalogue_id`s, so custom labels are not
       deduplicated: they are free text, they do not filter, and refusing them would
       mean adjudicating string similarity in a constraint. It renders as a
       duplicate on one profile and promotion fixes it permanently. */
    const first = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "Agent reviews" });
    const second = await practitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "agent  reviews" });

    expectAllowed(first);
    expectAllowed(second);
    expect(await servicesThrough(practitioner, mine)).toHaveLength(2);
  });

  it("refuses a catalogue service that does not exist", async () => {
    const result = await practitioner.client.from("practitioner_services").insert({
      practitioner_id: mine,
      catalogue_id: "00000000-0000-0000-0000-000000000000",
    });

    expectSqlstate(result, sqlstate.foreignKeyViolation);
  });
});

describe("the cap of three", () => {
  it("refuses a fourth service whichever kinds the first three were", async () => {
    /* Written across both kinds, which is the whole assertion: three catalogue
       rows plus one custom row is four services, and a cap enforced per kind is
       precisely the half-enforcement that ruled out two array columns. */
    const fixtures = [
      {
        held: [{ catalogueId: serviceA }, { catalogueId: serviceB }, { catalogueId: serviceC }],
        fourth: { label: "And one more thing" },
      },
      {
        held: [{ label: "One" }, { label: "Two" }, { label: "Three" }],
        fourth: { catalogue_id: serviceD },
      },
      {
        held: [{ catalogueId: serviceA }, { label: "Two" }, { catalogueId: serviceB }],
        fourth: { catalogue_id: serviceC },
      },
    ] as const;

    for (const { held, fourth } of fixtures) {
      for (const service of held) await seedService(mine, service);

      const result = await practitioner.client
        .from("practitioner_services")
        .insert({ practitioner_id: mine, ...fourth });

      expectSqlstate(result, sqlstate.checkViolation);

      await sql("delete from public.practitioner_services where practitioner_id = $1", [mine]);
    }
  });

  it("still lets a profile at the cap edit a service in place", async () => {
    /* The assertion that catches a cap written without `id is distinct from
       new.id`. Such a trigger counts the row being updated among its siblings and
       raises, so a profile that has always been within the cap becomes uneditable
       the moment it reaches three — invisible until somebody meets the limit. */
    await seedService(mine, { catalogueId: serviceA });
    await seedService(mine, { catalogueId: serviceB });
    const third = await seedService(mine, { catalogueId: serviceC });

    const repointed = await practitioner.client
      .from("practitioner_services")
      .update({ catalogue_id: serviceD })
      .eq("id", third);
    const relabelled = await practitioner.client
      .from("practitioner_services")
      .update({ catalogue_id: null, label: "Something I wrote myself" })
      .eq("id", third);

    expectAllowed(repointed);
    expectAllowed(relabelled);
    expect(await servicesThrough(practitioner, mine)).toHaveLength(3);
  });

  it("counts per profile, so the cap does not leak between practitioners", async () => {
    for (const service of [{ catalogueId: serviceA }, { catalogueId: serviceB }, { catalogueId: serviceC }]) {
      await seedService(mine, service);
    }

    const result = await otherPractitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: theirs, catalogue_id: serviceA });

    expectAllowed(result);
  });

  it("holds against an admin too, since it is a rule rather than a permission", async () => {
    for (const service of [{ catalogueId: serviceA }, { catalogueId: serviceB }, { catalogueId: serviceC }]) {
      await seedService(mine, service);
    }

    const result = await admin.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "Promoted by hand" });

    expectSqlstate(result, sqlstate.checkViolation);
  });
});

describe("anon", () => {
  it("reads both kinds on an approved profile and neither on one that is not", async () => {
    await seedService(mine, { catalogueId: serviceA });
    await seedService(mine, { label: "Rescuing agent runs at 2am" });
    const pending = await seedProfile({ status: "pending" });
    await seedService(pending, { catalogueId: serviceA });
    const withdrawn = await seedProfile({ status: "withdrawn" });
    await seedService(withdrawn, { catalogueId: serviceB });

    const approved = await anon.client
      .from("practitioner_services")
      .select("id, catalogue_id, label")
      .eq("practitioner_id", mine);
    const hidden = await anon.client
      .from("practitioner_services")
      .select("id, practitioner_id")
      .in("practitioner_id", [pending, withdrawn]);

    /* The child follows its parent. `services_read_public` asks whether the profile
       is published through `profile_is_approved()` — a `security definer` helper
       rather than an inline subquery, because `anon` holds no `select` on
       `practitioners.status` and the inline form is refused `42501` on the
       directory's own read path. */
    expectAllowed(approved);
    expect(approved.data).toHaveLength(2);
    expectAllowed(hidden);
    expect(hidden.data).toEqual([]);
  });

  it("is refused `select *` and the timestamps", async () => {
    await seedService(mine, { catalogueId: serviceA });

    const star = await anon.client.from("practitioner_services").select();
    const created = await anon.client.from("practitioner_services").select("id, created_at");
    const updated = await anon.client.from("practitioner_services").select("id, updated_at");

    /* Reads are column-scoped, so `select *` is refused and every query in the app
       must name its columns. Both provenance columns, because either one alone
       leaves the other free to be granted unnoticed. */
    expectPermissionDenied(anon, star);
    expectPermissionDenied(anon, created);
    expectPermissionDenied(anon, updated);
  });

  it("cannot write a service at all", async () => {
    const inserted = await anon.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "Whatever I like" });
    const row = await seedService(mine, { catalogueId: serviceA });
    const updated = await anon.client
      .from("practitioner_services")
      .update({ label: "Mine now" })
      .eq("id", row);
    const removed = await anon.client.from("practitioner_services").delete().eq("id", row);

    expectPermissionDenied(anon, inserted);
    expectPermissionDenied(anon, updated);
    expectPermissionDenied(anon, removed);
  });

  it("sees a profile with no services as a profile with no services", async () => {
    /* Empty is legal and normal: a practitioner who has not said what they sell is
       not a broken profile, and requiring it would turn publishing a profile into
       declaring a commercial offering. */
    expect(await servicesThrough(anon, mine)).toEqual([]);
  });
});

describe("another practitioner", () => {
  it("cannot list a service against a profile that is not theirs", async () => {
    const catalogue = await otherPractitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, catalogue_id: serviceA });
    const custom = await otherPractitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: mine, label: "I do their job now" });

    expectPermissionDenied(otherPractitioner, catalogue);
    expectPermissionDenied(otherPractitioner, custom);
  });

  it("cannot edit or remove somebody else's service", async () => {
    const row = await seedService(mine, { catalogueId: serviceA });

    const updated = await otherPractitioner.client
      .from("practitioner_services")
      .update({ catalogue_id: serviceB })
      .eq("id", row);
    const removed = await otherPractitioner.client
      .from("practitioner_services")
      .delete()
      .eq("id", row);

    /* The grants to `authenticated` are table-wide on purpose — `delete` cannot be
       column-scoped at all — so `services_rw_own` is the only thing between any
       signed-in account and every practitioner's services. Both requests are
       allowed and match nothing, which is what a policy filtering rows looks like
       from outside. */
    expectAllowed(updated);
    expectAllowed(removed);
    expect(await servicesThrough(practitioner, mine)).toEqual([
      { id: row, catalogue_id: serviceA, label: null },
    ]);
  });

  it("cannot write against an unclaimed profile", async () => {
    const unclaimed = await seedProfile({ status: "approved" });

    const result = await otherPractitioner.client
      .from("practitioner_services")
      .insert({ practitioner_id: unclaimed, label: "Not mine to say" });

    /* `owns_profile` compares against a null `user_id`, which is null rather than
       true — so an unclaimed profile is nobody's, without an extra clause saying
       so. Its services are still publicly readable, because curated intake is a
       published profile like any other. */
    expectPermissionDenied(otherPractitioner, result);
  });
});

describe("the catalogue underneath", () => {
  it("refuses deleting a service somebody offers, and allows retiring it", async () => {
    await seedService(mine, { catalogueId: serviceA });

    const removed = await admin.client.from("service_catalogue").delete().eq("id", serviceA);
    const retired = await admin.client
      .from("service_catalogue")
      .update({ active: false })
      .eq("id", serviceA);
    const stillRendered = await anon.client
      .from("practitioner_services")
      .select("catalogue_id, service_catalogue(label, active)")
      .eq("practitioner_id", mine)
      .single();

    /* `on delete restrict`, not `cascade`: a catalogue row is retired with
       `active = false`, never deleted out from under somebody's profile. Retiring
       hides it from the picker and leaves every profile offering it rendering. */
    expectSqlstate(removed, sqlstate.foreignKeyViolation);
    expectAllowed(retired);
    expectAllowed(stillRendered);
    expect(stillRendered.data?.service_catalogue).toMatchObject({ active: false });
  });

  it("takes a profile's services with the profile", async () => {
    const doomed = await seedProfile({ status: "approved" });
    await seedService(doomed, { catalogueId: serviceA });
    await seedService(doomed, { label: "Gone with it" });

    await sql("delete from public.practitioners where id = $1", [doomed]);

    const [{ count }] = await sql<{ count: string }>(
      "select count(*) from public.practitioner_services where practitioner_id = $1",
      [doomed],
    );

    /* `on delete cascade`, the opposite direction from the catalogue: the services
       are the profile's own, so erasure has to take them. Counted as `postgres`
       because the rows are meant to be gone rather than merely invisible — a
       caller-side read of nothing would pass with the rows still there. */
    expect(count).toBe("0");
  });
});

describe("`updated_at`", () => {
  it("moves when a service is edited, and holds still at insert", async () => {
    const row = await seedService(mine, { catalogueId: serviceA });

    const atInsert = await admin.client
      .from("practitioner_services")
      .select("created_at, updated_at")
      .eq("id", row)
      .single();

    await practitioner.client
      .from("practitioner_services")
      .update({ catalogue_id: serviceB })
      .eq("id", row);

    const afterEdit = await admin.client
      .from("practitioner_services")
      .select("updated_at")
      .eq("id", row)
      .single();

    /* `set_updated_at` is the only thing writing this column — the table has no
       guard of its own, and `practitioner_services_cap` returns `new` untouched. It
       is in the `authenticated` select grant, so it is a column the API serves and
       a timestamp that silently lies would be worse than an absent one. */
    expectAllowed(atInsert);
    expect(atInsert.data?.updated_at).toBe(atInsert.data?.created_at);
    expectAllowed(afterEdit);
    expect(
      new Date(afterEdit.data!.updated_at).getTime(),
    ).toBeGreaterThan(new Date(atInsert.data!.updated_at).getTime());
  });
});

describe("the badge", () => {
  it("survives a profile's services being added, edited and removed", async () => {
    /* The negative case for the clearing rules, and it is an assertion about a
       different table rather than a column now. `practitioner_services` carries
       nothing Bluehex attests to, so there is no `OLD` to pin and no badge to
       clear: rewriting what you offer is ordinary editing, exactly like `bio`. An
       agent adding a guard here would be implementing from the shape of the
       neighbouring tables rather than from the spec. */
    const [entry] = await sql<{ id: string }>(
      `insert into public.credential_catalogue (kind, platform, label)
       values ('course', 'Anthropic Academy', $1) returning id`,
      [`harness service badge ${Date.now()}`],
    );
    await sql(
      `insert into public.practitioner_credentials
         (practitioner_id, catalogue_id, earned_at, verified, verified_at)
       values ($1, $2, '2026-01-15', true, now())`,
      [mine, entry!.id],
    );

    try {
      const added = await practitioner.client
        .from("practitioner_services")
        .insert({ practitioner_id: mine, catalogue_id: serviceA })
        .select("id")
        .single();
      const edited = await practitioner.client
        .from("practitioner_services")
        .update({ catalogue_id: null, label: "Written by me" })
        .eq("id", added.data!.id);
      const removed = await practitioner.client
        .from("practitioner_services")
        .delete()
        .eq("id", added.data!.id);

      const credential = await anon.client
        .from("practitioner_credentials")
        .select("verified")
        .eq("practitioner_id", mine)
        .single();

      expectAllowed(added);
      expectAllowed(edited);
      expectAllowed(removed);
      expectAllowed(credential);
      expect(credential.data?.verified).toBe(true);
    } finally {
      await sql("delete from public.practitioner_credentials where catalogue_id = $1", [
        entry!.id,
      ]);
      await sql("delete from public.credential_catalogue where id = $1", [entry!.id]);
    }
  });
});
