import { beforeAll, describe, expect, it } from "vitest";

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
 * `practitioner_review_notes`, and the two admin RPCs that write it.
 *
 * The note is a table rather than a column on the profile because a column cannot
 * be scoped to the person it is about: column privileges are per role and row
 * level security is per row, so `grant select (review_note) … to authenticated`
 * handed every signed-in practitioner Bluehex's feedback about every other one.
 * The assertion that buys that back is written from a *second* account, because
 * one written from the owner passes identically whether the policy runs or not.
 *
 * Feedback goes one way. `authenticated` holds `select` and nothing else, so the
 * subject of a note cannot edit it, delete it or reply in it.
 */

let anon: Caller;
let practitioner: Caller;
let otherPractitioner: Caller;
let admin: Caller;

/** The practitioner's own profile. One per account — `unique (user_id)`. */
let mine: string;

let contacts = 0;
async function seedContact(createdBy: string | null): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email, created_by)
     values ($1, $2) returning id`,
    [`note-${contacts}-${Date.now()}@bluehex.test`, createdBy],
  );
  return row!.id;
}

async function seedProfile(userId: string | null): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name)
     values ($1, $2, 'Fixture') returning id`,
    [await seedContact(userId), userId],
  );
  return row!.id;
}

/** Puts a note on a profile as `postgres`. Set up through SQL, assert through a caller. */
async function seedNote(profileId: string, note: string): Promise<void> {
  await sql(
    `insert into public.practitioner_review_notes (practitioner_id, note)
     values ($1, $2)
     on conflict (practitioner_id) do update set note = excluded.note`,
    [profileId, note],
  );
}

async function noteOn(profileId: string): Promise<string | undefined> {
  const rows = await sql<{ note: string }>(
    "select note from public.practitioner_review_notes where practitioner_id = $1",
    [profileId],
  );
  return rows[0]?.note;
}

async function statusOf(profileId: string): Promise<string> {
  const [row] = await sql<{ status: string }>(
    "select status from public.practitioners where id = $1",
    [profileId],
  );
  return row!.status;
}

beforeAll(async () => {
  anon = anonCaller();
  practitioner = await practitionerCaller("practitioner");
  otherPractitioner = await practitionerCaller("other practitioner");
  admin = await adminCaller("admin");

  mine = await seedProfile(practitioner.userId);
});

describe("anon", () => {
  it("cannot reach the table at all, filter included", async () => {
    await seedNote(mine, "needs a headline");

    const whole = await anon.client
      .from("practitioner_review_notes")
      .select("practitioner_id, note");
    const filtered = await anon.client
      .from("practitioner_review_notes")
      .select("note")
      .eq("practitioner_id", mine);

    expectPermissionDenied(anon, whole);
    expectPermissionDenied(anon, filtered);
  });
});

describe("the practitioner a note is about", () => {
  it("reads it", async () => {
    await seedNote(mine, "needs a headline");

    const result = await practitioner.client
      .from("practitioner_review_notes")
      .select("practitioner_id, note, written_at")
      .eq("practitioner_id", mine)
      .single();

    expectAllowed(result);
    expect(result.data?.note).toBe("needs a headline");
  });

  it("cannot write one", async () => {
    const insert = await practitioner.client
      .from("practitioner_review_notes")
      .insert({ practitioner_id: mine, note: "actually I am fine" });

    expectPermissionDenied(practitioner, insert);
  });

  it("cannot edit the one about them", async () => {
    await seedNote(mine, "needs a headline");

    const update = await practitioner.client
      .from("practitioner_review_notes")
      .update({ note: "looks great" })
      .eq("practitioner_id", mine);

    expectPermissionDenied(practitioner, update);
    expect(await noteOn(mine)).toBe("needs a headline");
  });

  it("cannot delete it", async () => {
    await seedNote(mine, "needs a headline");

    const remove = await practitioner.client
      .from("practitioner_review_notes")
      .delete()
      .eq("practitioner_id", mine);

    expectPermissionDenied(practitioner, remove);
    expect(await noteOn(mine)).toBe("needs a headline");
  });
});

describe("another practitioner", () => {
  it("cannot read somebody else's note, by filter or otherwise", async () => {
    await seedNote(mine, "needs a headline");

    const byFilter = await otherPractitioner.client
      .from("practitioner_review_notes")
      .select("note")
      .eq("practitioner_id", mine);
    const whole = await otherPractitioner.client
      .from("practitioner_review_notes")
      .select("practitioner_id, note");

    /* The grant is table-wide for `authenticated`; only `review_notes_read_own`
       narrows it, so this is the assertion that the policy runs at all. */
    expectAllowed(byFilter);
    expect(byFilter.data).toEqual([]);
    expectAllowed(whole);
    expect(whole.data).toEqual([]);
  });
});

describe("the admin write path", () => {
  it("refuses `reject_practitioner` to anon and to a practitioner", async () => {
    const asAnon = await anon.client.rpc("reject_practitioner", {
      profile_id: mine,
      note: "no",
    });
    const asPractitioner = await practitioner.client.rpc("reject_practitioner", {
      profile_id: mine,
      note: "no",
    });

    /* No authorization logic inside the function: Postgres refuses the call
       itself, so there is no second authorization model to disagree with the
       first. */
    expectPermissionDenied(anon, asAnon);
    expectPermissionDenied(practitioner, asPractitioner);
  });

  it("refuses `approve_practitioner` to anon and to a practitioner", async () => {
    const asAnon = await anon.client.rpc("approve_practitioner", {
      profile_id: mine,
    });
    const asPractitioner = await practitioner.client.rpc("approve_practitioner", {
      profile_id: mine,
    });

    expectPermissionDenied(anon, asAnon);
    expectPermissionDenied(practitioner, asPractitioner);
  });

  it("upserts the note when an admin rejects, and stamps who wrote it", async () => {
    await sql("delete from public.practitioner_review_notes where practitioner_id = $1", [
      mine,
    ]);

    const first = await admin.client.rpc("reject_practitioner", {
      profile_id: mine,
      note: "the headline is empty",
    });
    expectAllowed(first);
    expect(await statusOf(mine)).toBe("rejected");
    expect(await noteOn(mine)).toBe("the headline is empty");

    const second = await admin.client.rpc("reject_practitioner", {
      profile_id: mine,
      note: "and so is the bio",
    });
    expectAllowed(second);
    /* One current note per profile rather than a history — `written_at` and
       `written_by` say who last wrote it. */
    expect(await noteOn(mine)).toBe("and so is the bio");

    const owner = await practitioner.client
      .from("practitioner_review_notes")
      .select("note, written_at")
      .eq("practitioner_id", mine)
      .single();
    expectAllowed(owner);
    expect(owner.data?.note).toBe("and so is the bio");

    const [row] = await sql<{ written_by: string }>(
      "select written_by from public.practitioner_review_notes where practitioner_id = $1",
      [mine],
    );
    expect(row?.written_by).toBe(admin.userId);
  });

  it("deletes the note when an admin approves", async () => {
    await seedNote(mine, "still needs a headline");

    const result = await admin.client.rpc("approve_practitioner", {
      profile_id: mine,
    });

    expectAllowed(result);
    expect(await statusOf(mine)).toBe("approved");
    /* Approved rows carry no rejection feedback — a delete rather than a null,
       because the note is a row now. */
    expect(await noteOn(mine)).toBeUndefined();

    const [row] = await sql<{ approved_by: string | null }>(
      "select approved_by from public.practitioners where id = $1",
      [mine],
    );
    expect(row?.approved_by).toBe(admin.userId);
  });

  it("bumps `updated_at` when a note is edited", async () => {
    const theirs = await seedProfile(otherPractitioner.userId);
    await seedNote(theirs, "first pass");
    const [before] = await sql<{ updated_at: Date }>(
      "select updated_at from public.practitioner_review_notes where practitioner_id = $1",
      [theirs],
    );

    const result = await admin.client
      .from("practitioner_review_notes")
      .update({ note: "second pass" })
      .eq("practitioner_id", theirs)
      .select("practitioner_id");
    expectAllowed(result);

    const [after] = await sql<{ updated_at: Date }>(
      "select updated_at from public.practitioner_review_notes where practitioner_id = $1",
      [theirs],
    );
    /* `set_updated_at` is the only thing writing it: this table has no guard of
       its own, and a timestamp that silently lies is worse than an absent one. */
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );

    await sql("delete from public.practitioners where id = $1", [theirs]);
  });

  it("takes the note with the profile when the profile is erased", async () => {
    const doomed = await seedProfile(null);
    await seedNote(doomed, "curated, then dropped");

    await sql("delete from public.practitioners where id = $1", [doomed]);

    /* `on delete cascade` on the primary key. The contact row is a second
       statement rather than a cascade — that is #52's problem, and its test. */
    expect(await noteOn(doomed)).toBeUndefined();
  });

  it("refuses a note against a profile that is not there", async () => {
    const result = await admin.client
      .from("practitioner_review_notes")
      .insert({
        practitioner_id: "00000000-0000-0000-0000-000000000000",
        note: "nobody",
      });

    expect(result.error?.code).toBe(sqlstate.foreignKeyViolation);
  });
});
