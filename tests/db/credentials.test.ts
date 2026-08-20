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
 * `practitioner_credentials` — the table the Verified badge attests to.
 *
 * This is the first place an untrusted writer sits next to Bluehex's own
 * attestation, and getting it wrong fails **open**: a practitioner who can write
 * `verified` destroys the only thing the directory sells, silently, with every
 * other assertion in this suite still passing. So `verified` is protected by two
 * mechanisms rather than either alone — it is absent from the `authenticated`
 * grant lists, and `credentials_guard` states the rule again where a column grant
 * cannot. The two assertions that restore the grants by hand are what catch a
 * later migration undoing the first half.
 *
 * The other half of the file is the clearing rules, and they divide by *what*
 * changed. An edit to the claim clears that one credential and is
 * `credentials_guard`'s doing. A change to who the profile is — a rename, a claim,
 * or the contact email an unclaimed profile's claim is checked against — clears
 * every credential on it, through `clear_profile_verification()`. Both directions
 * are asserted, and the negative cases matter more than the positive ones: a
 * clearing rule that fires too often takes badges off people who did nothing, and
 * the round-tripped-form case below is exactly how that arrives.
 */

let anon: Caller;
let practitioner: Caller;
let otherPractitioner: Caller;
/**
 * A signed-in account owning no profile of its own, so it is available to claim
 * one. `unique (user_id)` means one profile per account, so the fixtures that own
 * something cannot also be the one that exercises claiming.
 */
let newcomer: Caller;
let admin: Caller;

/** The practitioner's own profile: approved, claimed, and the subject of most of this file. */
let mine: string;
/** The second practitioner's, so row level security has something to refuse. */
let theirs: string;
/** Two catalogue entries, because "clears *that* credential" needs a sibling. */
let entryA: string;
let entryB: string;

/** The name `mine` is restored to after every test, so a rename cannot leak. */
const fixtureName = "Fixture owner";

/* Rows a test made, swept by label and by name so no test depends on another's
   cleanup. Credentials go first: `on delete restrict` on `catalogue_id` means a
   claimed entry cannot be deleted, which is the rule under test in
   `catalogue-guard.test.ts` and would otherwise make this sweep fail. */
afterEach(async () => {
  await sql(
    `delete from public.practitioner_credentials
      where catalogue_id in (select id from public.credential_catalogue
                              where label like 'harness %')`,
  );
  await sql("delete from public.practitioners where name like 'harness %'");
  await sql(
    `delete from public.practitioner_contacts c
      where c.contact_email like 'harness-%'
        and not exists (select 1 from public.practitioners p where p.contact_id = c.id)`,
  );
  /* Restored rather than asserted around: several tests rename `mine`, and a
     leaked rename would make the negative round-trip assertion below pass for the
     wrong reason. */
  await sql("update public.practitioners set name = $1 where id = $2 and name <> $1", [
    fixtureName,
    mine,
  ]);
});

/**
 * The file's own fixtures, which `afterEach` deliberately leaves alone.
 *
 * Not tidiness: the catalogue entries are `unique (kind, platform, label)`, so a run
 * that leaks them makes the *next* run fail in `beforeAll` — as a duplicate key on a
 * label nobody typed, with every test in the file reported **skipped** rather than
 * failed. Deleting the profiles first is what makes the catalogue rows deletable at
 * all, since `on delete restrict` refuses an entry with claims against it.
 */
afterAll(async () => {
  await sql("delete from public.practitioners where id = any($1::uuid[])", [
    [mine, theirs],
  ]);
  await sql("delete from public.credential_catalogue where id = any($1::uuid[])", [
    [entryA, entryB],
  ]);
  await sql(
    "delete from public.practitioner_contacts where contact_email like 'harness-credentials-%'",
  );
});

/** Writes a contact row as `postgres` and returns its id. */
let contacts = 0;
async function seedContact(): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ($1) returning id`,
    [`harness-credentials-${contacts}-${Date.now()}@bluehex.test`],
  );
  return row!.id;
}

/** Writes a profile as `postgres`. Set-up is SQL; every assertion is a caller. */
async function seedProfile(
  options: {
    userId?: string | null;
    status?: string;
    name?: string;
    contactId?: string;
  } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, $3, $4::public.practitioner_status) returning id`,
    [
      options.contactId ?? (await seedContact()),
      options.userId ?? null,
      options.name ?? "harness profile",
      options.status ?? "approved",
    ],
  );
  return row!.id;
}

/** Writes a catalogue entry as `postgres` and returns its id. */
let entries = 0;
async function seedCatalogueEntry(label: string): Promise<string> {
  entries += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.credential_catalogue (kind, platform, label)
     values ('course', 'Anthropic Academy', $1) returning id`,
    [`harness ${label} ${entries}`],
  );
  return row!.id;
}

/**
 * Writes a credential as `postgres`, which is the only way to write one that is
 * already `verified` — `credentials_guard` exempts the owner of the tables and
 * refuses everybody else, which is the whole point of the file.
 */
async function seedCredential(
  practitionerId: string,
  catalogueId: string,
  options: {
    verified?: boolean;
    verifiedBy?: string | null;
    earnedAt?: string;
    evidenceUrl?: string | null;
    evidencePublic?: boolean;
  } = {},
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_credentials
       (practitioner_id, catalogue_id, earned_at, evidence_url, evidence_public,
        verified, verified_at, verified_by)
     values ($1, $2, $3, $4, $5, $6, case when $6 then now() end, $7)
     returning id`,
    [
      practitionerId,
      catalogueId,
      options.earnedAt ?? "2026-01-15",
      options.evidenceUrl ?? null,
      options.evidencePublic ?? false,
      options.verified ?? false,
      options.verifiedBy ?? null,
    ],
  );
  return row!.id;
}

/** Reads `verified` back **through a caller**, so a policy is exercised rather than bypassed. */
async function verifiedThrough(caller: Caller, credentialId: string): Promise<unknown> {
  const result = await caller.client
    .from("practitioner_credentials")
    .select("verified")
    .eq("id", credentialId)
    .single();

  expectAllowed(result);
  return result.data?.verified;
}

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  practitioner = await practitionerCaller("practitioner");
  otherPractitioner = await practitionerCaller("other practitioner");
  newcomer = await practitionerCaller("newcomer");
  admin = await adminCaller("admin");

  mine = await seedProfile({ userId: practitioner.userId, name: fixtureName });
  theirs = await seedProfile({
    userId: otherPractitioner.userId,
    name: "Fixture stranger",
  });

  entryA = await seedCatalogueEntry("entry A");
  entryB = await seedCatalogueEntry("entry B");
});

describe("what a credential row may say", () => {
  it("refuses `earned_at` null, so there is no in-progress credential", async () => {
    /* In-progress rows were removed from the design and `not null` is the whole
       enforcement. Asserted directly so the concept cannot return as data after
       the prose that removed it has been forgotten. */
    const result = await practitioner.client.from("practitioner_credentials").insert({
      practitioner_id: mine,
      catalogue_id: entryA,
      earned_at: null as never,
    });

    expectSqlstate(result, sqlstate.notNullViolation);
  });

  it("refuses a catalogue entry that does not exist", async () => {
    /* Refused by the foreign key rather than by a trigger — `catalogue_id` being a
       reference is half of "a practitioner cannot invent a credential", the other
       half being that nobody but `bluehex_admin` can insert into the table it
       points at. */
    const result = await practitioner.client.from("practitioner_credentials").insert({
      practitioner_id: mine,
      catalogue_id: "00000000-0000-0000-0000-000000000000",
      earned_at: "2026-01-15",
    });

    expectSqlstate(result, sqlstate.foreignKeyViolation);
  });

  it("refuses the same entry claimed twice, and allows two people to claim one entry", async () => {
    await seedCredential(mine, entryA);

    const again = await practitioner.client.from("practitioner_credentials").insert({
      practitioner_id: mine,
      catalogue_id: entryA,
      earned_at: "2026-02-01",
    });
    const somebodyElse = await otherPractitioner.client
      .from("practitioner_credentials")
      .insert({
        practitioner_id: theirs,
        catalogue_id: entryA,
        earned_at: "2026-02-01",
      });

    expectSqlstate(again, sqlstate.uniqueViolation);
    /* The half a unique constraint written one column short would break, and it is
       the normal case: a catalogue entry exists to be claimed by many people. */
    expectAllowed(somebodyElse);
  });

  it("refuses an `evidence_url` the `https_url` domain rejects, and accepts a shouted one", async () => {
    /* The backstop for the only mechanism between a practitioner-written string
       and an `href` on a public page — `evidence_url_public` is granted to `anon`
       and rendered as a link. */
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com/proof",
      "https:///foo",
    ]) {
      const result = await practitioner.client.from("practitioner_credentials").insert({
        practitioner_id: mine,
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        evidence_url: url,
      });

      expectSqlstate(result, sqlstate.checkViolation);
    }

    const shouted = await practitioner.client
      .from("practitioner_credentials")
      .insert({
        practitioner_id: mine,
        catalogue_id: entryA,
        earned_at: "2026-01-15",
        evidence_url: "HTTPS://Example.com/proof",
      })
      .select("evidence_url")
      .single();

    /* RFC 3986 makes the scheme case-insensitive, so the check is too. */
    expectAllowed(shouted);
    expect(shouted.data?.evidence_url).toBe("HTTPS://Example.com/proof");
  });
});

describe("`verified` is not the practitioner's to write", () => {
  it("refuses a practitioner PATCHing it on their own credential", async () => {
    const credential = await seedCredential(mine, entryA);

    const result = await practitioner.client
      .from("practitioner_credentials")
      .update({ verified: true })
      .eq("id", credential);

    /* The column is absent from the `authenticated` update grant, so this is
       refused at the privilege layer before any policy or trigger is consulted. */
    expectPermissionDenied(practitioner, result);
    expect(await verifiedThrough(practitioner, credential)).toBe(false);
  });

  it("stays refused when the column grant is restored by hand", async () => {
    /* The single most valuable assertion in the file. The grant list and the
       trigger are two mechanisms and neither is sufficient alone — this is what
       catches a later migration re-granting the column, which fails open and
       silently. Written as a `grant` because there is no other way to express it:
       the harness's `sql()` seam exists for exactly this. */
    const credential = await seedCredential(mine, entryA);

    await sql("grant update (verified) on public.practitioner_credentials to authenticated");
    try {
      const result = await practitioner.client
        .from("practitioner_credentials")
        .update({ verified: true })
        .eq("id", credential)
        .select("verified")
        .single();

      /* Accepted at the privilege layer now, and pinned by the guard — which is
         why the assertion is on the value rather than on a status code. */
      expectAllowed(result);
      expect(result.data?.verified).toBe(false);
    } finally {
      await sql(
        "revoke update (verified) on public.practitioner_credentials from authenticated",
      );
    }
  });

  it("refuses a practitioner naming it at insert", async () => {
    const result = await practitioner.client.from("practitioner_credentials").insert({
      practitioner_id: mine,
      catalogue_id: entryA,
      earned_at: "2026-01-15",
      verified: true,
    });

    expectPermissionDenied(practitioner, result);
  });

  it("forces it false at insert when the column grant is restored by hand", async () => {
    /* The insert half of the backstop, and the one place the guard *forces* rather
       than refuses: `OLD` is not assigned during a `before insert`, so there is
       nothing to pin to and a credential is born unverified instead. Assert the
       stored value rather than the response code — a client that round-trips the
       whole row gets a saved credential, not an error it cannot act on. */
    await sql("grant insert (verified) on public.practitioner_credentials to authenticated");
    try {
      const result = await practitioner.client
        .from("practitioner_credentials")
        .insert({
          practitioner_id: mine,
          catalogue_id: entryA,
          earned_at: "2026-01-15",
          verified: true,
        })
        .select("verified")
        .single();

      expectAllowed(result);
      expect(result.data?.verified).toBe(false);
    } finally {
      await sql(
        "revoke insert (verified) on public.practitioner_credentials from authenticated",
      );
    }
  });

  it("leaves the existing credentials verified when a new one is added", async () => {
    /* The incentive property the whole design turns on. A practitioner who earns a
       second certification must not lose the badge on the first for saying so —
       if adding a credential cost them their existing verification, the rational
       move would be to stop declaring credentials, which is the opposite of what
       the directory is for. */
    const held = await seedCredential(mine, entryA, { verified: true });

    const added = await practitioner.client
      .from("practitioner_credentials")
      .insert({ practitioner_id: mine, catalogue_id: entryB, earned_at: "2026-03-01" })
      .select("id, verified")
      .single();

    expectAllowed(added);
    expect(added.data?.verified).toBe(false);
    expect(await verifiedThrough(practitioner, held)).toBe(true);
  });
});

describe("editing a claim clears the check of it", () => {
  it("clears on `earned_at`, and only on that credential", async () => {
    const edited = await seedCredential(mine, entryA, { verified: true });
    const sibling = await seedCredential(mine, entryB, { verified: true });

    const result = await practitioner.client
      .from("practitioner_credentials")
      .update({ earned_at: "2026-04-04" })
      .eq("id", edited)
      .select("verified")
      .single();

    expectAllowed(result);
    expect(result.data?.verified).toBe(false);
    /* Per credential, not per profile: the rest of the profile's claims were not
       edited and are still as checked as they were. */
    expect(await verifiedThrough(practitioner, sibling)).toBe(true);
  });

  it("clears on `catalogue_id`, which is the largest edit there is", async () => {
    const credential = await seedCredential(mine, entryA, { verified: true });

    const result = await practitioner.client
      .from("practitioner_credentials")
      .update({ catalogue_id: entryB })
      .eq("id", credential)
      .select("verified")
      .single();

    expectAllowed(result);
    expect(result.data?.verified).toBe(false);
  });

  it("clears on `evidence_url`", async () => {
    const credential = await seedCredential(mine, entryA, {
      verified: true,
      evidenceUrl: "https://example.com/old-proof",
    });

    const result = await practitioner.client
      .from("practitioner_credentials")
      .update({ evidence_url: "https://example.com/new-proof" })
      .eq("id", credential)
      .select("verified")
      .single();

    expectAllowed(result);
    expect(result.data?.verified).toBe(false);
  });

  it("does not clear on `evidence_public`", async () => {
    /* Deliberately absent from the guard's list. Publishing or unpublishing the
       proof changes the claim's *visibility*, not the claim — the credential
       Bluehex checked is the same credential, and a practitioner who makes their
       evidence public should not be punished for it. */
    const credential = await seedCredential(mine, entryA, {
      verified: true,
      evidenceUrl: "https://example.com/proof",
    });

    const result = await practitioner.client
      .from("practitioner_credentials")
      .update({ evidence_public: true })
      .eq("id", credential)
      .select("verified, evidence_url_public")
      .single();

    expectAllowed(result);
    expect(result.data?.verified).toBe(true);
    expect(result.data?.evidence_url_public).toBe("https://example.com/proof");
  });
});

describe("changing who the profile is clears every credential on it", () => {
  it("clears on a rename", async () => {
    /* The badge asserts *this person* holds these credentials, so a new name is a
       new assertion and has to be re-checked. */
    const first = await seedCredential(mine, entryA, { verified: true });
    const second = await seedCredential(mine, entryB, { verified: true });

    const result = await practitioner.client
      .from("practitioners")
      .update({ name: "Someone Else Entirely" })
      .eq("id", mine);

    expectAllowed(result);
    expect(await verifiedThrough(practitioner, first)).toBe(false);
    expect(await verifiedThrough(practitioner, second)).toBe(false);
  });

  it("clears nothing when the whole form is saved with `name` unchanged", async () => {
    /* The case that actually bites, and the reason
       `when (old.name is distinct from new.name)` is on the trigger. `update of
       name` fires when `name` appears in the statement's `SET` list, whether or not
       the value changed — and `supabase.from('practitioners').update(form)`
       round-trips the whole form object. Without the `when` clause every bio edit
       would clear every badge on the profile, which is the failure the design's
       incentive argument exists to avoid arriving through the back door. */
    const first = await seedCredential(mine, entryA, { verified: true });
    const second = await seedCredential(mine, entryB, { verified: true });

    const result = await practitioner.client
      .from("practitioners")
      .update({
        name: fixtureName,
        headline: "Claude practitioner",
        bio: "Rewritten, and the form sent everything back.",
        location: "Sydney",
        availability: "A couple of evenings a week.",
        focus: ["agents"],
        website_url: "https://example.com/me",
      })
      .eq("id", mine);

    expectAllowed(result);
    expect(await verifiedThrough(practitioner, first)).toBe(true);
    expect(await verifiedThrough(practitioner, second)).toBe(true);
  });

  it("clears nothing when the profile is edited without naming `name`", async () => {
    const credential = await seedCredential(mine, entryA, { verified: true });

    const result = await practitioner.client
      .from("practitioners")
      .update({ bio: "An ordinary edit.", headline: "Still here" })
      .eq("id", mine)
      .select("status")
      .single();

    expectAllowed(result);
    /* `status` is the other Bluehex-owned axis and is independent of the badge —
       editing a profile must not unpublish it either. */
    expect(result.data?.status).toBe("approved");
    expect(await verifiedThrough(practitioner, credential)).toBe(true);
  });

  it("clears when an unclaimed profile is claimed", async () => {
    /* A larger change than a rename: the claim decides which account the person
       is. The worst outcome of a claim that should not have happened is therefore
       an *unverified* profile carrying somebody's name — vandalism an admin can
       undo, rather than a stolen credential. */
    const profile = await seedProfile({ status: "pending" });
    const credential = await seedCredential(profile, entryA, { verified: true });

    const result = await admin.client
      .from("practitioners")
      .update({ user_id: newcomer.userId })
      .eq("id", profile);

    expectAllowed(result);
    expect(await verifiedThrough(admin, credential)).toBe(false);
  });

  it("clears when the contact email of an *unclaimed* profile changes", async () => {
    /* While `user_id is null` that address is not a contact detail, it is the lock:
       an unclaimed profile is claimed by matching the claimer's verified account
       email against it, so anyone who can change it can redirect the claim. Making
       the change clear the badge means a redirected claim inherits an unverified
       profile, and it costs the legitimate case one re-check on a profile nobody
       owns yet. */
    const contact = await seedContact();
    const profile = await seedProfile({ contactId: contact, status: "pending" });
    const credential = await seedCredential(profile, entryA, { verified: true });

    const result = await admin.client
      .from("practitioner_contacts")
      .update({ contact_email: "harness-redirected@bluehex.test" })
      .eq("id", contact);

    expectAllowed(result);
    expect(await verifiedThrough(admin, credential)).toBe(false);
  });

  it("clears nothing when the contact email of a *claimed* profile changes", async () => {
    /* The direction a test that missed it would get wrong in the expensive way:
       once ownership is settled the address is ordinary contact information the
       owner edits freely, and clearing here would make every verified practitioner
       lose their badge for updating their own email. */
    const credential = await seedCredential(mine, entryA, { verified: true });
    const [row] = await sql<{ contact_id: string }>(
      "select contact_id from public.practitioners where id = $1",
      [mine],
    );

    const result = await practitioner.client
      .from("practitioner_contacts")
      .update({ contact_email: "harness-still-mine@bluehex.test" })
      .eq("id", row!.contact_id);

    expectAllowed(result);
    expect(await verifiedThrough(practitioner, credential)).toBe(true);
  });
});

describe("what anon may read", () => {
  it("is refused `evidence_url`, and reads `evidence_url_public` instead", async () => {
    /* Column privileges are static, so "readable only when another column is true"
       is not sayable as a grant, and row level security filters rows rather than
       columns. The generated column is what makes `evidence_public` enforceable
       rather than advisory: `anon` holds the masked column and never the raw one. */
    const credential = await seedCredential(mine, entryA, {
      evidenceUrl: "https://example.com/proof",
    });

    const raw = await anon.client
      .from("practitioner_credentials")
      .select("evidence_url")
      .eq("id", credential);
    const whileOptedOut = await anon.client
      .from("practitioner_credentials")
      .select("evidence_url_public")
      .eq("id", credential)
      .single();

    expectPermissionDenied(anon, raw);
    expectAllowed(whileOptedOut);
    expect(whileOptedOut.data?.evidence_url_public).toBeNull();

    await sql(
      "update public.practitioner_credentials set evidence_public = true where id = $1",
      [credential],
    );

    const whileOptedIn = await anon.client
      .from("practitioner_credentials")
      .select("evidence_url_public")
      .eq("id", credential)
      .single();

    expectAllowed(whileOptedIn);
    expect(whileOptedIn.data?.evidence_url_public).toBe("https://example.com/proof");
  });

  it("is refused `select *` and `verified_by`, as is a practitioner", async () => {
    await seedCredential(mine, entryA);

    const star = await anon.client.from("practitioner_credentials").select();
    const asAnon = await anon.client.from("practitioner_credentials").select("verified_by");
    const asPractitioner = await practitioner.client
      .from("practitioner_credentials")
      .select("verified_by");

    /* Reads are column-scoped in both directions, so `select *` is refused and
       every query in the app must name its columns. Who performed a check is not
       public, and is not another practitioner's business either. */
    expectPermissionDenied(anon, star);
    expectPermissionDenied(anon, asAnon);
    expectPermissionDenied(practitioner, asPractitioner);
  });

  it("sees the credentials of an approved profile and none of a profile that is not", async () => {
    const visible = await seedCredential(mine, entryA);
    const pending = await seedProfile({ status: "pending" });
    await seedCredential(pending, entryA);
    const withdrawn = await seedProfile({ status: "withdrawn" });
    await seedCredential(withdrawn, entryA);

    const approved = await anon.client
      .from("practitioner_credentials")
      .select("id")
      .eq("id", visible);
    const hidden = await anon.client
      .from("practitioner_credentials")
      .select("id, practitioner_id")
      .in("practitioner_id", [pending, withdrawn]);

    /* The child follows its parent. `credentials_read_public` asks whether the
       profile is published through `profile_is_approved()` — a `security definer`
       helper rather than an inline subquery, because `anon` holds no `select` on
       `practitioners.status` and the inline form is refused `42501` on the
       directory's own read path. */
    expectAllowed(approved);
    expect(approved.data).toHaveLength(1);
    expectAllowed(hidden);
    expect(hidden.data).toEqual([]);
  });
});

describe("another practitioner", () => {
  it("cannot insert a credential against a profile that is not theirs", async () => {
    const result = await otherPractitioner.client
      .from("practitioner_credentials")
      .insert({ practitioner_id: mine, catalogue_id: entryA, earned_at: "2026-01-15" });

    expectPermissionDenied(otherPractitioner, result);
  });

  it("cannot update or delete somebody else's credential", async () => {
    const credential = await seedCredential(mine, entryA, { verified: true });

    const update = await otherPractitioner.client
      .from("practitioner_credentials")
      .update({ earned_at: "2020-01-01" })
      .eq("id", credential);
    const remove = await otherPractitioner.client
      .from("practitioner_credentials")
      .delete()
      .eq("id", credential);

    /* The grants to `authenticated` are table-wide on purpose and only
       `credentials_rw_own` narrows them — `delete` cannot be column-scoped at all,
       so the policy is the only thing between any signed-in account and every
       practitioner's credentials. Both requests are allowed and match nothing,
       which is what a policy filtering rows looks like from outside. */
    expectAllowed(update);
    expectAllowed(remove);
    expect(await verifiedThrough(practitioner, credential)).toBe(true);
  });

  it("cannot see the credentials of an unclaimed profile", async () => {
    const unclaimed = await seedProfile({ status: "pending" });
    await seedCredential(unclaimed, entryA);

    const result = await otherPractitioner.client
      .from("practitioner_credentials")
      .select("id")
      .eq("practitioner_id", unclaimed);

    /* `owns_profile` compares against a null `user_id`, which is null rather than
       true — so an unclaimed profile is nobody's, without an extra clause saying
       so. */
    expectAllowed(result);
    expect(result.data).toEqual([]);
  });
});

describe("the owner", () => {
  it("can delete a credential they entered by mistake", async () => {
    /* `delete` stays here, unlike on `practitioners`, and the asymmetry is
       deliberate: removing a claim you typed wrong is ordinary editing of your own
       claim, not erasure of a record Bluehex has attested to. It cannot launder a
       verified row either — delete and re-add yields an unverified credential,
       which is the same outcome as editing one. */
    const credential = await seedCredential(mine, entryA, { verified: true });

    const remove = await practitioner.client
      .from("practitioner_credentials")
      .delete()
      .eq("id", credential);
    const readdedAsUnverified = await practitioner.client
      .from("practitioner_credentials")
      .insert({ practitioner_id: mine, catalogue_id: entryA, earned_at: "2026-01-15" })
      .select("verified")
      .single();

    expectAllowed(remove);
    expectAllowed(readdedAsUnverified);
    expect(readdedAsUnverified.data?.verified).toBe(false);
  });
});

describe("the admin write path", () => {
  it("verifies a credential and stamps who checked it, and when", async () => {
    const credential = await seedCredential(mine, entryA);

    const result = await admin.client.rpc("set_credential_verified", {
      credential_id: credential,
      value: true,
    });

    expectAllowed(result);
    expect(result.data?.verified).toBe(true);
    expect(result.data?.verified_by).toBe(admin.userId);
    expect(result.data?.verified_at).not.toBeNull();
  });

  it("clears the stamps when it takes verification away", async () => {
    /* Provenance follows the flag rather than accumulating: a credential that is
       not verified was not verified by anybody, at no time. */
    const credential = await seedCredential(mine, entryA, {
      verified: true,
      verifiedBy: admin.userId,
    });

    const result = await admin.client.rpc("set_credential_verified", {
      credential_id: credential,
      value: false,
    });

    expectAllowed(result);
    expect(result.data?.verified).toBe(false);
    expect(result.data?.verified_at).toBeNull();
    expect(result.data?.verified_by).toBeNull();
  });

  it("is refused to anon and to a practitioner, including on their own credential", async () => {
    const credential = await seedCredential(mine, entryA);

    const asAnon = await anon.client.rpc("set_credential_verified", {
      credential_id: credential,
      value: true,
    });
    const asPractitioner = await practitioner.client.rpc("set_credential_verified", {
      credential_id: credential,
      value: true,
    });

    /* No authorization logic inside the function: Postgres refuses the call itself,
       so there is no second authorization model to disagree with the first. */
    expectPermissionDenied(anon, asAnon);
    expectPermissionDenied(practitioner, asPractitioner);
    expect(await verifiedThrough(practitioner, credential)).toBe(false);
  });

  it("keeps `clear_profile_verification` unreachable to every API caller", async () => {
    /* It exists for the triggers and reaches past a practitioner's grants by
       design, so a caller who could invoke it directly could strip the badge from
       any profile in the directory. */
    const asPractitioner = await practitioner.client.rpc(
      "clear_profile_verification" as never,
      { profile_id: mine } as never,
    );
    const asAdmin = await admin.client.rpc("clear_profile_verification" as never, {
      profile_id: mine,
    } as never);

    expectPermissionDenied(practitioner, asPractitioner);
    expectPermissionDenied(admin, asAdmin);
  });
});

describe("deleting the account of whoever did the checking", () => {
  it("succeeds, nulling `verified_by` and leaving the credential verified", async () => {
    /* Attribution is what this design trades away at account deletion, and the
       assertion is what says so out loud. The alternative is the default
       `NO ACTION`, under which an admin who leaves is undeletable for as long as
       any credential they ever checked exists — and a credential is not less
       checked because the checker's account is gone. */
    const checker = await practitionerCaller("departing checker");
    const credential = await seedCredential(mine, entryA, {
      verified: true,
      verifiedBy: checker.userId,
    });

    await sql("delete from auth.users where id = $1", [checker.userId]);

    const result = await admin.client
      .from("practitioner_credentials")
      .select("verified, verified_by")
      .eq("id", credential)
      .single();

    expectAllowed(result);
    expect(result.data?.verified).toBe(true);
    expect(result.data?.verified_by).toBeNull();
  });
});
