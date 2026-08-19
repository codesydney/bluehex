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
  expectSqlstate,
  sqlstate,
} from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `practitioners` — the published record, and the two Bluehex-owned axes on it.
 *
 * `status` governs whether anyone else can see the profile and is Bluehex's call
 * in three of its four values. It is protected the way `verified` will be in #50,
 * by **both** mechanisms and not either alone: the column is absent from the
 * `authenticated` update grant, and `practitioners_guard` pins it to `OLD` for
 * every non-admin caller. The backstop assertion below — restore the grant by
 * hand and confirm the trigger still holds — is the one that catches a later
 * migration undoing the protection, which is the failure mode that fails open and
 * silently.
 */

let anon: Caller;
let practitioner: Caller;
let otherPractitioner: Caller;
/**
 * A signed-in account that owns no profile for most of this file. `unique
 * (user_id)` means one profile per account, so an account that is *used* as an
 * owner cannot also be the one that exercises creation and claiming — the second
 * fixture would collide with the first and the failure reads as a broken policy.
 */
let newcomer: Caller;
let admin: Caller;

/** The practitioner's own profile, `pending`, shared by the suites below. */
let mine: string;

/** Writes a contact row as `postgres` and returns its id. */
let contacts = 0;
async function seedContact(createdBy: string | null = null): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email, created_by)
     values ($1, $2) returning id`,
    [`profile-${contacts}-${Date.now()}@bluehex.test`, createdBy],
  );
  return row!.id;
}

/** Writes a profile as `postgres`. Set-up is SQL; every assertion is a caller. */
async function seedProfile(options: {
  userId?: string | null;
  status?: string;
  name?: string;
}): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, $3, $4::public.practitioner_status) returning id`,
    [
      await seedContact(options.userId ?? null),
      options.userId ?? null,
      options.name ?? "Fixture",
      options.status ?? "approved",
    ],
  );
  return row!.id;
}

/** Reads a column back as `postgres`, for set-up bookkeeping only. */
async function columnOf<T>(id: string, column: string): Promise<T> {
  const [row] = await sql<Record<string, T>>(
    `select ${column} as value from public.practitioners where id = $1`,
    [id],
  );
  return row!.value;
}

beforeAll(async () => {
  anon = anonCaller();
  practitioner = await practitionerCaller("practitioner");
  otherPractitioner = await practitionerCaller("other practitioner");
  newcomer = await practitionerCaller("newcomer");
  admin = await adminCaller("admin");

  mine = await seedProfile({ userId: practitioner.userId, status: "pending" });
});

describe("creating a profile", () => {
  it("is allowed for yourself", async () => {
    const contact = await seedContact(newcomer.userId);

    const result = await newcomer.client
      .from("practitioners")
      .insert({
        contact_id: contact,
        user_id: newcomer.userId,
        name: "Ada",
      })
      .select("id, name")
      .single();

    expectAllowed(result);
    expect(result.data?.name).toBe("Ada");
    await sql("delete from public.practitioners where id = $1", [result.data!.id]);
  });

  it("is refused for somebody else's account", async () => {
    const contact = await seedContact(newcomer.userId);

    const result = await newcomer.client.from("practitioners").insert({
      contact_id: contact,
      user_id: otherPractitioner.userId,
      name: "Not mine",
    });

    expectPermissionDenied(newcomer, result);
  });

  it("is refused with no owner, so a practitioner cannot create an unclaimed profile", async () => {
    const contact = await seedContact(newcomer.userId);

    /* `auth.uid() = user_id` is null rather than true when `user_id` is null, so
       `practitioners_insert_own` refuses this with no extra clause. Curated
       intake is an admin's job. */
    const result = await newcomer.client
      .from("practitioners")
      .insert({ contact_id: contact, name: "Unclaimed" });

    expectPermissionDenied(newcomer, result);
  });

  it("is refused with no contact", async () => {
    const result = await newcomer.client
      .from("practitioners")
      .insert({ user_id: newcomer.userId, name: "No contact" } as never);

    /* `not null` on `contact_id` is the entire guarantee that an approved
       profile can be reached — no deferrable constraint, no RPC, no application
       check. */
    expectSqlstate(result, sqlstate.notNullViolation);
  });

  it("cannot point at a contact row another profile already uses", async () => {
    const contact = await seedContact(newcomer.userId);
    const [existing] = await sql<{ id: string }>(
      `insert into public.practitioners (contact_id, name) values ($1, 'Existing')
       returning id`,
      [contact],
    );

    const result = await newcomer.client.from("practitioners").insert({
      contact_id: contact,
      user_id: newcomer.userId,
      name: "Sharing",
    });

    expectSqlstate(result, sqlstate.uniqueViolation);
    await sql("delete from public.practitioners where id = $1", [existing!.id]);
  });
});

describe("what anon may read", () => {
  it("is approved profiles and nothing else", async () => {
    const approved = await seedProfile({ status: "approved", name: "Published" });
    const pending = await seedProfile({ status: "pending", name: "Waiting" });
    const withdrawn = await seedProfile({ status: "withdrawn", name: "Gone" });

    const result = await anon.client.from("practitioners").select("id, name");

    expectAllowed(result);
    const ids = result.data!.map((row) => row.id);
    expect(ids).toContain(approved);
    expect(ids).not.toContain(pending);
    expect(ids).not.toContain(withdrawn);
  });

  it("is column-scoped, so `select *` is refused", async () => {
    const result = await anon.client.from("practitioners").select("*");

    expectPermissionDenied(anon, result);
  });

  it("does not include `status`, `user_id` or `contact_id`", async () => {
    for (const column of ["status", "user_id", "contact_id"]) {
      const result = await anon.client.from("practitioners").select(column);
      expectPermissionDenied(anon, result);
    }
  });

  it("does include the four published links", async () => {
    const id = await seedProfile({ status: "approved" });
    await sql(
      `update public.practitioners
          set website_url = 'https://example.com/ada',
              github_url = 'https://github.com/ada',
              linkedin_url = 'https://linkedin.com/in/ada',
              booking_url = 'https://cal.com/ada'
        where id = $1`,
      [id],
    );

    const result = await anon.client
      .from("practitioners")
      .select("website_url, github_url, linkedin_url, booking_url")
      .eq("id", id)
      .single();

    /* A route to a page, not a route to a person — see ADR 0002. The grant list
       is maintained by hand, so a column added later is unreadable until it is
       named. */
    expectAllowed(result);
    expect(result.data).toEqual({
      website_url: "https://example.com/ada",
      github_url: "https://github.com/ada",
      linkedin_url: "https://linkedin.com/in/ada",
      booking_url: "https://cal.com/ada",
    });
  });
});

describe("what a signed-in practitioner may read", () => {
  it("does not include `user_id` or `contact_id`", async () => {
    /* Column privileges are per role and row level security is per row, so a
       column readable "by the owner" is really readable by every signed-in
       caller on every row they can see. Both of these are handles to somebody
       else's account or PII. */
    for (const column of ["user_id", "contact_id"]) {
      const result = await practitioner.client.from("practitioners").select(column);
      expectPermissionDenied(practitioner, result);
    }
  });

  it("includes their own profile in any status", async () => {
    /* `mine` is `pending`, so it is reachable by `practitioners_read_own` and by
       nothing else — an owner sees their profile before Bluehex has looked at
       it. */
    const result = await practitioner.client
      .from("practitioners")
      .select("id, status")
      .eq("id", mine)
      .single();

    expectAllowed(result);
    expect(result.data?.status).toBe("pending");
  });

  it("excludes another practitioner's unapproved profile", async () => {
    const theirs = await seedProfile({
      userId: otherPractitioner.userId,
      status: "pending",
    });

    const result = await practitioner.client
      .from("practitioners")
      .select("id")
      .eq("id", theirs);

    expectAllowed(result);
    expect(result.data).toEqual([]);
    await sql("delete from public.practitioners where id = $1", [theirs]);
  });

  it("excludes an unclaimed profile that is not approved", async () => {
    const unclaimed = await seedProfile({ userId: null, status: "pending" });

    const result = await practitioner.client
      .from("practitioners")
      .select("id")
      .eq("id", unclaimed);

    expectAllowed(result);
    expect(result.data).toEqual([]);
  });
});

describe("editing a profile", () => {
  it("is allowed on the practitioner's own descriptive columns", async () => {
    const result = await practitioner.client
      .from("practitioners")
      .update({
        headline: "Claude, end to end",
        bio: "Ten years of it",
        focus: ["Agents", "MCP"],
        availability: "Two days a week",
        location: "Sydney",
        country_code: "AU",
        website_url: "https://example.com/",
      })
      .eq("id", mine)
      .select("headline, focus, availability, status")
      .single();

    expectAllowed(result);
    expect(result.data?.focus).toEqual(["Agents", "MCP"]);
    /* An edit never moves anybody along the admission axis. */
    expect(result.data?.status).toBe("pending");
  });

  it("bumps `updated_at`", async () => {
    const before = await columnOf<Date>(mine, "updated_at");

    const result = await practitioner.client
      .from("practitioners")
      .update({ headline: "Something else" })
      .eq("id", mine)
      .select("updated_at")
      .single();

    expectAllowed(result);
    expect(new Date(result.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    );
  });

  it("is refused on another practitioner's row", async () => {
    const theirs = await seedProfile({
      userId: otherPractitioner.userId,
      status: "approved",
    });

    const result = await practitioner.client
      .from("practitioners")
      .update({ headline: "Vandalism" })
      .eq("id", theirs)
      .select("id");

    expectAllowed(result);
    expect(result.data).toEqual([]);
    expect(await columnOf<string | null>(theirs, "headline")).toBeNull();
    await sql("delete from public.practitioners where id = $1", [theirs]);
  });

  it("is refused on an unclaimed profile", async () => {
    const unclaimed = await seedProfile({ userId: null, status: "approved" });

    const result = await practitioner.client
      .from("practitioners")
      .update({ headline: "Mine now" })
      .eq("id", unclaimed)
      .select("id");

    expectAllowed(result);
    expect(result.data).toEqual([]);
    expect(await columnOf<string | null>(unclaimed, "headline")).toBeNull();
  });

  it("cannot be turned into a delete", async () => {
    const result = await practitioner.client
      .from("practitioners")
      .delete()
      .eq("id", mine);

    /* There is no `delete` grant to `authenticated` and no
       `practitioners_delete_own` policy: leaving is `withdraw_profile()` (#52)
       and erasure is an admin action. */
    expectPermissionDenied(practitioner, result);
  });
});

describe("the Bluehex-owned columns", () => {
  const owned = {
    status: "approved",
    approved_at: new Date().toISOString(),
    approved_by: "00000000-0000-0000-0000-000000000000",
    owner_assigned_at: new Date().toISOString(),
    owner_assigned_by: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
  };

  for (const [column, value] of Object.entries(owned)) {
    it(`refuse a practitioner writing \`${column}\``, async () => {
      const result = await practitioner.client
        .from("practitioners")
        .update({ [column]: value } as never)
        .eq("id", mine);

      expectPermissionDenied(practitioner, result);
    });
  }

  it("stay pinned when the column grant is restored by hand", async () => {
    /* The single most valuable assertion in the suite. The grant list and the
       trigger are two mechanisms and neither is sufficient alone — this is what
       catches a later migration re-granting the column, which fails open and
       silently. Written as a `grant` because there is no other way to express
       it: the harness's `sql()` seam exists for exactly this. */
    await sql("grant update (status) on public.practitioners to authenticated");
    try {
      const result = await practitioner.client
        .from("practitioners")
        .update({ status: "approved" } as never)
        .eq("id", mine)
        .select("status")
        .single();

      /* Accepted at the privilege layer now, and pinned by the trigger — which
         is why the assertion is on the value rather than on a status code. */
      expectAllowed(result);
      expect(result.data?.status).toBe("pending");
    } finally {
      await sql("revoke update (status) on public.practitioners from authenticated");
    }
  });
});

describe("ownership, which is a state machine rather than a permission", () => {
  it("stamps provenance when an unclaimed profile is claimed", async () => {
    const unclaimed = await seedProfile({ userId: null, status: "pending" });

    const result = await admin.client
      .from("practitioners")
      .update({ user_id: newcomer.userId })
      .eq("id", unclaimed)
      .select("id");

    expectAllowed(result);
    /* Stamped by the trigger without the caller setting either, which is why
       `assign_profile_owner()` does not exist: an RPC is bypassable by anyone
       holding the `update` grant and a trigger is not. */
    expect(await columnOf<Date | null>(unclaimed, "owner_assigned_at")).not.toBeNull();
    expect(await columnOf<string | null>(unclaimed, "owner_assigned_by")).toBe(
      admin.userId,
    );

    await sql("delete from public.practitioners where id = $1", [unclaimed]);
  });

  it("forces `withdrawn` when a profile is unassigned", async () => {
    const claimed = await seedProfile({
      userId: otherPractitioner.userId,
      status: "approved",
    });

    const result = await admin.client
      .from("practitioners")
      .update({ user_id: null })
      .eq("id", claimed)
      .select("id");

    expectAllowed(result);
    expect(await columnOf<string>(claimed, "status")).toBe("withdrawn");
    await sql("delete from public.practitioners where id = $1", [claimed]);
  });

  it("refuses a change of owner outright, admins included", async () => {
    const claimed = await seedProfile({
      userId: otherPractitioner.userId,
      status: "approved",
    });

    const result = await admin.client
      .from("practitioners")
      .update({ user_id: newcomer.userId })
      .eq("id", claimed);

    /* Assert on the error, not on the row being unchanged: a test that only
       checked the value would pass against a silent pin, and silently pinning
       would tell an admin their write succeeded when it did nothing. */
    expectSqlstate(result, sqlstate.checkViolation);
    expect(await columnOf<string>(claimed, "user_id")).toBe(otherPractitioner.userId);
    await sql("delete from public.practitioners where id = $1", [claimed]);
  });

  it("gets a mis-assigned profile to the right account in two legal steps", async () => {
    const claimed = await seedProfile({
      userId: otherPractitioner.userId,
      status: "approved",
    });

    expectAllowed(
      await admin.client
        .from("practitioners")
        .update({ user_id: null })
        .eq("id", claimed)
        .select("id"),
    );
    expectAllowed(
      await admin.client
        .from("practitioners")
        .update({ user_id: newcomer.userId })
        .eq("id", claimed)
        .select("id"),
    );

    expect(await columnOf<string>(claimed, "user_id")).toBe(newcomer.userId);
    /* The profile stays withdrawn while its ownership was in question — coming
       back is a decision, not a side effect. */
    expect(await columnOf<string>(claimed, "status")).toBe("withdrawn");
    await sql("delete from public.practitioners where id = $1", [claimed]);
  });
});

describe("the `https_url` domain", () => {
  /* The only mechanism between a practitioner-written string and an `href` on a
     public page. `evidence_url` in #50 leans on the same domain. */
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.com",
    "https:///foo",
    "https://nodot",
  ]) {
    it(`refuses ${value}`, async () => {
      const result = await practitioner.client
        .from("practitioners")
        .update({ website_url: value })
        .eq("id", mine);

      expectSqlstate(result, sqlstate.checkViolation);
    });
  }

  it("accepts an uppercase scheme, because RFC 3986 makes it case-insensitive", async () => {
    const result = await practitioner.client
      .from("practitioners")
      .update({ website_url: "HTTPS://Example.com" })
      .eq("id", mine)
      .select("website_url")
      .single();

    expectAllowed(result);
    expect(result.data?.website_url).toBe("HTTPS://Example.com");
  });
});
