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
 * `catalogue_guard`, and the correction that is allowed to get past it.
 *
 * A separate file from `catalogues.test.ts` because everything here needs a
 * *claim* — the guard fires on entries that have credentials against them, and a
 * claimed entry cannot be swept up by that file's `delete … where label like
 * 'harness %'`, which is the rule under test.
 *
 * What it is for: `active` and `on delete restrict` both act on **deletion**, so
 * before this trigger the equally destructive `update` — repointing an entry at a
 * different credential, so that everybody's claim now says something they did not
 * claim — was one statement refused by a paragraph, with `bluehex_admin` holding
 * unrestricted `update` on the table. That is the pattern `AGENTS.md` names on
 * `verified`: a rule stated in prose and nowhere else. The two halves are asserted
 * as a pair below, because the point is that the destructive update and the
 * destructive delete are now equally hard.
 *
 * The guard deliberately does **not** clear verification on the dependent rows,
 * which is the other available fix. That would drop every badge in the directory
 * the first time an admin corrected a typo, and would treat the repoint as
 * something to compensate for rather than something to refuse.
 */

let anon: Caller;
let practitioner: Caller;
let admin: Caller;

/** The practitioner's own approved profile, so its claims are real claims. */
let mine: string;

const testLabel = (name: string) => `harness ${name}`;

/* Credentials first: `on delete restrict` means a claimed entry cannot be deleted,
   so sweeping the catalogue before the claims against it would fail. */
afterEach(async () => {
  await sql(
    `delete from public.practitioner_credentials
      where catalogue_id in (select id from public.credential_catalogue
                              where label like 'harness %')`,
  );
  await sql("delete from public.credential_catalogue where label like 'harness %'");
});

/* The profile and its contact outlive `afterEach`, so they are swept here — a leaked
   profile is a leaked `unique (user_id)`, which fails the *next* run in `beforeAll`
   and reports every test in the file skipped rather than failed. */
afterAll(async () => {
  await sql("delete from public.practitioners where id = $1", [mine]);
  await sql(
    `delete from public.practitioner_contacts
      where contact_email like 'harness-catalogue-guard-%'`,
  );
});

let entries = 0;
async function seedEntry(
  label: string,
  { kind = "course", platform = "Anthropic Academy" } = {},
): Promise<{ id: string; label: string }> {
  entries += 1;
  const unique = testLabel(`${label} ${entries}`);
  const [row] = await sql<{ id: string }>(
    `insert into public.credential_catalogue (kind, platform, label)
     values ($1, $2, $3) returning id`,
    [kind, platform, unique],
  );
  return { id: row!.id, label: unique };
}

/** A verified claim against an entry — written as `postgres`, the only writer of `verified`. */
async function seedClaim(catalogueId: string): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_credentials
       (practitioner_id, catalogue_id, earned_at, verified, verified_at)
     values ($1, $2, '2026-01-15', true, now()) returning id`,
    [mine, catalogueId],
  );
  return row!.id;
}

/** Reads the claim back through the admin, who is the only caller granted `verified_at`. */
async function claimStays(credentialId: string): Promise<void> {
  const result = await admin.client
    .from("practitioner_credentials")
    .select("verified")
    .eq("id", credentialId)
    .single();

  expectAllowed(result);
  expect(result.data?.verified).toBe(true);
}

beforeAll(async () => {
  anon = anonCaller();
  practitioner = await practitionerCaller("practitioner");
  admin = await adminCaller("admin");

  const [contact] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ($1) returning id`,
    [`harness-catalogue-guard-${Date.now()}@bluehex.test`],
  );
  const [profile] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, 'Catalogue guard fixture', 'approved') returning id`,
    [contact!.id, practitioner.userId],
  );
  mine = profile!.id;
});

describe("repointing a claimed entry", () => {
  it("is refused on `label`, on `kind` and on `platform`", async () => {
    const entry = await seedEntry("claimed course");
    await seedClaim(entry.id);

    for (const change of [
      { label: testLabel("something else entirely") },
      { kind: "certification" },
      { platform: "Pearson VUE" },
    ]) {
      const result = await admin.client
        .from("credential_catalogue")
        .update(change)
        .eq("id", entry.id);

      /* Assert on the error rather than on the row being unchanged. A test that
         only checked the value would pass against a silent pin, and silence is the
         wrong behaviour here: the admin has asked for something the design refuses
         and needs to be told, not quietly ignored. */
      expectSqlstate(result, sqlstate.checkViolation);
    }
  });

  it("is refused for the admin as much as anyone, and `bluehex_admin` holds `update`", async () => {
    /* Stated separately because it is the whole point. This is not a privilege the
       guard withholds — `bluehex_admin` has unrestricted `update` on this table and
       needs it, since `active`, `sort_order` and `course_url` are all edited that
       way. The refusal is about the columns and the claims, not about the caller. */
    const entry = await seedEntry("claimed course");
    await seedClaim(entry.id);

    const retire = await admin.client
      .from("credential_catalogue")
      .update({ active: false, sort_order: 9 })
      .eq("id", entry.id)
      .select("active, sort_order")
      .single();

    expectAllowed(retire);
    expect(retire.data?.active).toBe(false);
  });

  it("leaves `course_url` alone, because a page moving is not a repoint", async () => {
    /* Deliberately not among the watched columns. The credential is the same
       credential, nobody's claim changes meaning, and requiring the escape hatch
       for a link fix would train admins to reach for the escape hatch. */
    const entry = await seedEntry("claimed course");
    const claim = await seedClaim(entry.id);

    const result = await admin.client
      .from("credential_catalogue")
      .update({ course_url: "https://anthropic.skilljar.com/moved" })
      .eq("id", entry.id)
      .select("course_url")
      .single();

    expectAllowed(result);
    expect(result.data?.course_url).toBe("https://anthropic.skilljar.com/moved");
    await claimStays(claim);
  });

  it("is allowed on an entry nobody has claimed", async () => {
    /* The case the guard must not catch: it fires on claims, not on the columns.
       A course Anthropic renames before anybody has earned it is an ordinary
       admin `UPDATE`, which is this table's stated correction path. */
    const entry = await seedEntry("unclaimed course");

    const result = await admin.client
      .from("credential_catalogue")
      .update({ label: testLabel("renamed course") })
      .eq("id", entry.id)
      .select("label")
      .single();

    expectAllowed(result);
    expect(result.data?.label).toBe(testLabel("renamed course"));
  });
});

describe("correct_catalogue_entry", () => {
  it("performs the same change and leaves every claim verified", async () => {
    /* Postgres cannot tell a wording fix from a repoint, because the two are the
       same statement and differ only in intent. So intent is declared: the RPC
       sets a transaction-local setting the trigger reads. The trigger is still the
       enforcement — bypassing the RPC means arriving at the trigger without the
       setting, which is what stops this repeating the mistake
       `assign_profile_owner()` was deleted for. */
    const entry = await seedEntry("prompt engineering");
    const claim = await seedClaim(entry.id);

    const result = await admin.client.rpc("correct_catalogue_entry", {
      entry_id: entry.id,
      new_kind: "course",
      new_platform: "Anthropic Academy",
      new_label: testLabel("Prompt Engineering"),
    });

    expectAllowed(result);
    expect(result.data?.label).toBe(testLabel("Prompt Engineering"));
    /* The reason the guard refuses rather than clears: correcting a typo in
       Bluehex's own text does not make anybody's certificate less checked. */
    await claimStays(claim);
  });

  it("takes all three watched columns, so an unchanged one is passed back verbatim", async () => {
    /* Rather than nullable parameters meaning "leave this alone", which would make
       an omitted argument and an intended `null` the same call — on the columns
       where getting it wrong rewrites what somebody's badge asserts. */
    const entry = await seedEntry("certification", {
      kind: "certification",
      platform: "Pearson VUE",
    });
    await seedClaim(entry.id);

    const result = await admin.client.rpc("correct_catalogue_entry", {
      entry_id: entry.id,
      new_kind: "certification",
      new_platform: "Pearson VUE",
      new_label: testLabel("Claude Certification, corrected"),
    });

    expectAllowed(result);
    expect(result.data?.kind).toBe("certification");
    expect(result.data?.platform).toBe("Pearson VUE");
  });

  it("does not leave the declaration behind for the next statement", async () => {
    /* `set_config(…, true)` is transaction-local. If it leaked, the escape hatch
       would silently disarm the guard for everything that followed it on the same
       connection — which is every subsequent request PostgREST serves on it. */
    const corrected = await seedEntry("corrected entry");
    await seedClaim(corrected.id);
    const protectedEntry = await seedEntry("protected entry");
    await seedClaim(protectedEntry.id);

    const correction = await admin.client.rpc("correct_catalogue_entry", {
      entry_id: corrected.id,
      new_kind: "course",
      new_platform: "Anthropic Academy",
      new_label: testLabel("corrected wording"),
    });
    const repoint = await admin.client
      .from("credential_catalogue")
      .update({ label: testLabel("repointed anyway") })
      .eq("id", protectedEntry.id);

    expectAllowed(correction);
    expectSqlstate(repoint, sqlstate.checkViolation);
  });

  it("is refused to anon and to a practitioner", async () => {
    const entry = await seedEntry("claimed course");
    await seedClaim(entry.id);

    const asAnon = await anon.client.rpc("correct_catalogue_entry", {
      entry_id: entry.id,
      new_kind: "course",
      new_platform: "Anthropic Academy",
      new_label: testLabel("mine now"),
    });
    const asPractitioner = await practitioner.client.rpc("correct_catalogue_entry", {
      entry_id: entry.id,
      new_kind: "course",
      new_platform: "Anthropic Academy",
      new_label: testLabel("mine now"),
    });

    /* The escape hatch is not a hole. It declares intent for a caller who already
       holds `update` on the table, and nobody but `bluehex_admin` does. */
    expectPermissionDenied(anon, asAnon);
    expectPermissionDenied(practitioner, asPractitioner);
  });
});

describe("deleting a claimed entry", () => {
  it("is refused, and retiring it instead succeeds and keeps the claims verified", async () => {
    /* The pair that stops a tidy-up from silently dropping badges across the
       directory. `on delete restrict` makes the attempt fail loudly and points at
       `active`, which is the operation that was actually meant. */
    const entry = await seedEntry("claimed course");
    const claim = await seedClaim(entry.id);

    const removal = await admin.client
      .from("credential_catalogue")
      .delete()
      .eq("id", entry.id);
    const retirement = await admin.client
      .from("credential_catalogue")
      .update({ active: false })
      .eq("id", entry.id)
      .select("active")
      .single();

    expectSqlstate(removal, sqlstate.foreignKeyViolation);
    expectAllowed(retirement);
    expect(retirement.data?.active).toBe(false);
    await claimStays(claim);
  });

  it("still renders for anon once retired, so an earned credential is not blank", async () => {
    const entry = await seedEntry("claimed course");
    await seedClaim(entry.id);
    await sql("update public.credential_catalogue set active = false where id = $1", [
      entry.id,
    ]);

    const result = await anon.client
      .from("credential_catalogue")
      .select("id, label, active")
      .eq("id", entry.id)
      .single();

    /* `active` is deliberately absent from the read policy: hiding the row would
       make an earned credential display as nothing at all. It filters the picker,
       which is a query rather than a policy. */
    expectAllowed(result);
    expect(result.data?.active).toBe(false);
  });
});

describe("credential_catalogue.updated_at", () => {
  it("moves when an entry is corrected, and when one is retired", async () => {
    /* Trivial to assert and easy to ship broken, because a column with a default
       reads plausibly forever — and this is the table whose corrections are
       `UPDATE`s by design, so it is the one where a frozen timestamp misleads
       most. It sat unmaintained from `20260820201450_catalogues.sql` until now,
       because `catalogue_guard` is what bumps it and the guard's body reads a table
       that did not exist. */
    const entry = await seedEntry("timestamped entry");
    const [before] = await sql<{ updated_at: string }>(
      "select updated_at from public.credential_catalogue where id = $1",
      [entry.id],
    );

    const retirement = await admin.client
      .from("credential_catalogue")
      .update({ active: false })
      .eq("id", entry.id)
      .select("updated_at")
      .single();

    expectAllowed(retirement);
    expect(
      new Date(retirement.data!.updated_at).getTime(),
    ).toBeGreaterThan(new Date(before!.updated_at).getTime());

    await seedClaim(entry.id);
    const correction = await admin.client.rpc("correct_catalogue_entry", {
      entry_id: entry.id,
      new_kind: "course",
      new_platform: "Anthropic Academy",
      new_label: testLabel("timestamped entry, corrected"),
    });

    expectAllowed(correction);
    expect(new Date(correction.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(retirement.data!.updated_at).getTime(),
    );
  });
});
