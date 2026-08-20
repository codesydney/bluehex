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
 * `practitioner_contacts` — the table that exists so that an email address and a
 * phone number cannot be leaked by a future `grant select on practitioners to
 * anon`. See `docs/adr/0002-links-are-published-addresses-are-not.md`: the profile
 * publishes links, and never a route to the person.
 *
 * The contact is the **parent**, written before the profile that points at it, so
 * the policies need two routes in — the row you wrote (`created_by`) and the row a
 * profile of yours points at. Both are asserted here, and so are the two things
 * they say by omission: the row belongs to whoever the profile above it belongs to
 * now, so a claimer both reads and edits the row Bluehex wrote; and authorship
 * stops carrying the row once a profile points at it, so it is not a grant that
 * outlives the profile changing hands.
 */

let anon: Caller;
let practitioner: Caller;
let otherPractitioner: Caller;
let admin: Caller;

/** A fresh address per row, so no assertion can match another test's fixture. */
let addresses = 0;
function address(): string {
  addresses += 1;
  return `contact-${addresses}-${Date.now()}@bluehex.test`;
}

/** Writes a contact row as `postgres`, with `created_by` set to whoever is named. */
async function seedContact(createdBy: string | null): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email, created_by)
     values ($1, $2) returning id`,
    [address(), createdBy],
  );
  return row!.id;
}

/** Writes a profile as `postgres`, pointing at `contactId`. */
async function seedProfile(
  contactId: string,
  userId: string | null,
  status = "approved",
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioners (contact_id, user_id, name, status)
     values ($1, $2, 'Fixture', $3::public.practitioner_status) returning id`,
    [contactId, userId, status],
  );
  return row!.id;
}

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  practitioner = await practitionerCaller("practitioner");
  otherPractitioner = await practitionerCaller("other practitioner");
  admin = await adminCaller("admin");
});

describe("anon", () => {
  it("cannot read the table at all", async () => {
    const result = await anon.client
      .from("practitioner_contacts")
      .select("id, contact_email");

    expectPermissionDenied(anon, result);
  });

  it("cannot reach a row by filtering for it either", async () => {
    /* "Returns no rows" would be a policy doing the work. There is no grant, so
       the privilege layer refuses before any policy is consulted — which is the
       protection the table exists to have. */
    const id = await seedContact(null);
    const result = await anon.client
      .from("practitioner_contacts")
      .select("id")
      .eq("id", id);

    expectPermissionDenied(anon, result);
  });

  it("cannot write one", async () => {
    const result = await anon.client
      .from("practitioner_contacts")
      .insert({ contact_email: address() });

    expectPermissionDenied(anon, result);
  });
});

describe("a practitioner's own contact row", () => {
  it("is readable back before any profile points at it", async () => {
    const email = address();
    const insert = await practitioner.client
      .from("practitioner_contacts")
      .insert({ contact_email: email })
      .select("id")
      .single();
    expectAllowed(insert);

    const read = await practitioner.client
      .from("practitioner_contacts")
      .select("id, contact_email, contact_phone, contact_note")
      .eq("id", insert.data!.id)
      .single();

    expectAllowed(read);
    expect(read.data?.contact_email).toBe(email);
  });

  it("is writable by its author", async () => {
    const insert = await practitioner.client
      .from("practitioner_contacts")
      .insert({ contact_email: address() })
      .select("id")
      .single();
    expectAllowed(insert);

    const update = await practitioner.client
      .from("practitioner_contacts")
      .update({ contact_note: "prefers email" })
      .eq("id", insert.data!.id)
      .select("contact_note")
      .single();

    expectAllowed(update);
    expect(update.data?.contact_note).toBe("prefers email");
  });

  it("takes its `created_by` from the token rather than from the request", async () => {
    /* Not in the `authenticated` insert grant, so naming it is refused at the
       privilege layer rather than being quietly ignored. */
    const result = await practitioner.client.from("practitioner_contacts").insert({
      contact_email: address(),
      created_by: otherPractitioner.userId,
    } as never);

    expectPermissionDenied(practitioner, result);
  });

  it("bumps `updated_at` when it is edited", async () => {
    const insert = await practitioner.client
      .from("practitioner_contacts")
      .insert({ contact_email: address() })
      .select("id, updated_at")
      .single();
    expectAllowed(insert);

    const update = await practitioner.client
      .from("practitioner_contacts")
      .update({ contact_phone: "+61 2 0000 0000" })
      .eq("id", insert.data!.id)
      .select("updated_at")
      .single();

    expectAllowed(update);
    /* `set_updated_at` is the only thing writing this column — the table has no
       guard of its own — and it is in the `authenticated` select grant, so a
       frozen value is a column the API serves and lies about. */
    expect(
      new Date(update.data!.updated_at).getTime(),
    ).toBeGreaterThan(new Date(insert.data!.updated_at).getTime());
  });
});

describe("somebody else's contact row", () => {
  it("is invisible to another practitioner", async () => {
    const id = await seedContact(practitioner.userId);

    const byId = await otherPractitioner.client
      .from("practitioner_contacts")
      .select("id, contact_email")
      .eq("id", id);
    const wholeTable = await otherPractitioner.client
      .from("practitioner_contacts")
      .select("id, contact_email");

    expectAllowed(byId);
    expect(byId.data).toEqual([]);
    expectAllowed(wholeTable);
    expect(wholeTable.data?.some((row) => row.id === id)).toBe(false);
  });

  it("is unaffected by another practitioner's update", async () => {
    const id = await seedContact(practitioner.userId);

    const update = await otherPractitioner.client
      .from("practitioner_contacts")
      .update({ contact_note: "taken" })
      .eq("id", id)
      .select("id");

    /* No error: `using` matched nothing, so the statement touched no rows. The
       assertion that matters is the one made from the owner. */
    expectAllowed(update);
    expect(update.data).toEqual([]);

    const owner = await practitioner.client
      .from("practitioner_contacts")
      .select("contact_note")
      .eq("id", id)
      .single();
    expectAllowed(owner);
    expect(owner.data?.contact_note).toBeNull();
  });

  it("cannot be reassigned to another practitioner", async () => {
    const id = await seedContact(practitioner.userId);

    const result = await otherPractitioner.client
      .from("practitioner_contacts")
      .update({ created_by: otherPractitioner.userId } as never)
      .eq("id", id);

    expectPermissionDenied(otherPractitioner, result);
  });
});

describe("a curated contact row, written by Bluehex", () => {
  it("becomes readable to the practitioner who claims the profile pointing at it", async () => {
    const id = await seedContact(admin.userId);
    const profile = await seedProfile(id, null);

    const beforeClaim = await practitioner.client
      .from("practitioner_contacts")
      .select("id")
      .eq("id", id);
    expectAllowed(beforeClaim);
    expect(beforeClaim.data).toEqual([]);

    const claim = await admin.client
      .from("practitioners")
      .update({ user_id: practitioner.userId })
      .eq("id", profile)
      .select("id");
    expectAllowed(claim);

    const afterClaim = await practitioner.client
      .from("practitioner_contacts")
      .select("id, contact_email")
      .eq("id", id)
      .single();

    /* The profile clause of `contacts_read_own`. Omitting it fails as "my own
       contact details are invisible to me", which nobody guesses from the error. */
    expectAllowed(afterClaim);
    expect(afterClaim.data?.id).toBe(id);
  });

  it("is writable by the claimer, who is the person it describes", async () => {
    const id = await seedContact(admin.userId);
    const profile = await seedProfile(id, null);

    const claim = await admin.client
      .from("practitioners")
      .update({ user_id: otherPractitioner.userId })
      .eq("id", profile)
      .select("id");
    expectAllowed(claim);

    const result = await otherPractitioner.client
      .from("practitioner_contacts")
      .update({ contact_email: address(), contact_note: "reach me here" })
      .eq("id", id)
      .select("contact_note")
      .single();

    /* `with check` named `created_by` alone until #49, which locked the claimer
       out of correcting the address their own profile was about to publish. The
       clause read as a defence against reassignment and was not one: `created_by`
       is absent from the `authenticated` update grant, so that is refused a layer
       lower — which is what the next test is really asserting. */
    expectAllowed(result);
    expect(result.data?.contact_note).toBe("reach me here");
  });

  it("still cannot have its `created_by` reassigned by the claimer", async () => {
    /* A fresh account: `unique (user_id)` means the caller above is already an
       owner by the time this runs. */
    const claimer = await practitionerCaller("claimer");
    const id = await seedContact(admin.userId);
    const profile = await seedProfile(id, null);

    expectAllowed(
      await admin.client
        .from("practitioners")
        .update({ user_id: claimer.userId })
        .eq("id", profile)
        .select("id"),
    );

    const result = await claimer.client
      .from("practitioner_contacts")
      .update({ created_by: claimer.userId } as never)
      .eq("id", id);

    /* The privilege layer, not the policy — 42501 for want of a column grant.
       Editing the details and taking the row's authorship are two different
       things, and only the second was ever meant to be refused. */
    expectPermissionDenied(claimer, result);
    expect(result.error?.code).toBe(sqlstate.insufficientPrivilege);
  });
});

describe("a contact row whose profile has changed hands", () => {
  it("stops answering to the practitioner who wrote it", async () => {
    /* `created_by` is a grant nothing ever takes away unless something ends it.
       A profile can be reassigned — unassign, then assign, which is the supported
       repair for a mis-assignment — and the row then holds the new owner's
       details while the original author still matches `created_by`. Without
       `contact_is_unattached` the stranger who typed the row goes on reading and
       writing it, while the person the details are about cannot.

       Fresh accounts rather than the file's fixtures: `unique (user_id)` means an
       account can own one profile, and both of the callers above are already
       owners by the time this runs. */
    const author = await practitionerCaller("author");
    const successor = await practitionerCaller("successor");

    const id = await seedContact(author.userId);
    const profile = await seedProfile(id, author.userId);

    expectAllowed(
      await admin.client
        .from("practitioners")
        .update({ user_id: null })
        .eq("id", profile)
        .select("id"),
    );
    expectAllowed(
      await admin.client
        .from("practitioners")
        .update({ user_id: successor.userId })
        .eq("id", profile)
        .select("id"),
    );

    const read = await author.client
      .from("practitioner_contacts")
      .select("id, contact_email")
      .eq("id", id);
    expectAllowed(read);
    expect(read.data).toEqual([]);

    const write = await author.client
      .from("practitioner_contacts")
      .update({ contact_note: "still mine" })
      .eq("id", id)
      .select("id");
    /* `using` matches nothing now, so this touches no rows rather than erroring.
       The assertion that matters is the value, read back as `postgres`. */
    expectAllowed(write);
    expect(write.data).toEqual([]);

    const [row] = await sql<{ contact_note: string | null }>(
      "select contact_note from public.practitioner_contacts where id = $1",
      [id],
    );
    expect(row?.contact_note).toBeNull();

    await sql("delete from public.practitioners where id = $1", [profile]);
  });
});

describe("an admin", () => {
  it("reads and writes any contact row", async () => {
    const id = await seedContact(practitioner.userId);

    const read = await admin.client
      .from("practitioner_contacts")
      .select("id, contact_email, created_by")
      .eq("id", id)
      .single();
    expectAllowed(read);
    expect(read.data?.created_by).toBe(practitioner.userId);

    const update = await admin.client
      .from("practitioner_contacts")
      .update({ contact_note: "spoke on the phone" })
      .eq("id", id)
      .select("contact_note")
      .single();
    expectAllowed(update);
    expect(update.data?.contact_note).toBe("spoke on the phone");
  });
});
