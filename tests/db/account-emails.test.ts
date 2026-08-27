import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminCaller, anonCaller, practitionerCaller, type Caller } from "./harness/callers";
import { expectAllowed, expectPermissionDenied } from "./harness/result";
import { sql } from "./harness/stack";

/**
 * `account_emails()` — an account id resolved to an address, for admins only.
 *
 * **The execute grant is the only thing protecting this function, so the test
 * that a practitioner is refused is the test of the whole design.** Every other
 * `security definer` function in this schema is guarded by its predicate:
 * `my_profile()` returns rows joined to `auth.uid()`, so widening its grant would
 * be untidy rather than dangerous. This one takes an argument and answers about
 * somebody other than the caller, so there is no predicate to fall back on. If
 * `authenticated` could execute it, every signed-in practitioner could read every
 * account's address, and nothing else in the schema would notice.
 *
 * The other assertion worth naming is that an account holding no profile still
 * resolves. That looks like a missing restriction and is a deliberate one: the
 * caller this function was written for is an admin about to hand a curated
 * profile to its claimer, and a claimer holds no profile yet. A later change that
 * narrows the population to profile holders would read as tightening security
 * and would silently break the feature, so the case is pinned here rather than
 * argued for in a comment.
 */

let anon: Caller;
let admin: Caller;
/** A signed-in practitioner. The caller the grant has to keep out. */
let practitioner: Caller;
/**
 * A second account, holding no profile at all. This is the claimer's shape: an
 * account that exists and owns nothing, which is exactly the state a curated
 * profile is handed into.
 */
let claimer: Caller;
/**
 * An account whose `email` is nulled in `beforeAll`. `auth.users.email` is
 * nullable, so this is a state the type permits, and the function's
 * `email is not null` clause is the only thing deciding what happens to it.
 */
let addressless: Caller;

/** The addresses the accounts above actually carry, read as `postgres`. */
let practitionerEmail: string;
let claimerEmail: string;

/** An id in the right shape that names no account. */
const absent = "00000000-0000-4000-8000-0000000000ff";

beforeAll(async () => {
  anon = anonCaller();
  /* Sequential rather than `Promise.all`: sign-ups are rate limited per IP and a
     burst is the thing the limit counts. */
  admin = await adminCaller();
  practitioner = await practitionerCaller("practitioner");
  claimer = await practitionerCaller("claimer");
  addressless = await practitionerCaller("addressless");

  /* Signing up is the only way to get a well-formed account, and it insists on
     an address, so the state is reached by taking the address away afterwards
     rather than by writing `auth.users` by hand. */
  await sql("update auth.users set email = null where id = $1", [addressless.userId]);

  /* The practitioner holds a profile and the claimer does not, so the pair
     separates "resolves an account" from "resolves an account that happens to
     own something". */
  await seedProfile(practitioner.userId, "Harness account-emails practitioner");

  practitionerEmail = await addressOf(practitioner.userId!);
  claimerEmail = await addressOf(claimer.userId!);
});

afterAll(async () => {
  await sql(`delete from public.practitioners where name like 'Harness account-emails%'`);
  await sql(
    `delete from public.practitioner_contacts where contact_email like 'harness-account-emails%'`,
  );
  /* No `deleteCreatedUsers()` here: `harness/setup.ts` calls it for every file in
     the project, and its afterAll runs after this one. */
});

describe("who may call it", () => {
  it("refuses anon", async () => {
    expectPermissionDenied(anon, await anon.client.rpc("account_emails", { ids: [absent] }));
  });

  it("refuses a signed-in practitioner", async () => {
    /* The assertion this file exists for. There is no predicate inside the
       function that would save us here: it returns whatever ids it is given, so
       a practitioner who could execute it could read every address in
       `auth.users` by enumerating uuids. The grant is the entire control.

       Asked with the practitioner's own id on purpose. A function that leaked
       only other people's rows would be an odd shape to build, and a test that
       passed an id belonging to nobody could be refused for a reason that had
       nothing to do with privilege. */
    expectPermissionDenied(
      practitioner,
      await practitioner.client.rpc("account_emails", { ids: [practitioner.userId!] }),
    );
  });

  it("allows an admin", async () => {
    expectAllowed(await admin.client.rpc("account_emails", { ids: [admin.userId!] }));
  });

  it("exposes every address the moment the grant is widened by hand", async () => {
    /* **The most valuable assertion in the file, and it asserts the exposure
       rather than a refusal.** `my_profile()` can afford a loose grant because
       its predicate joins every row to `auth.uid()`; this function returns the
       ids it is handed, so there is no second mechanism underneath the grant.
       Restoring `execute` to `authenticated` is therefore enough to hand every
       practitioner every address in `auth.users`, and this is what says so.

       That is what makes the refusal above meaningful. Without this, a test that
       a practitioner is refused would pass equally well if the refusal came from
       somewhere else, and nobody would learn that the grant is load-bearing.

       If this ever fails, somebody has added a second mechanism inside the
       function. That is an improvement rather than a regression, and the note in
       `20260827124213_account_emails.sql` saying the grant is the whole control
       needs updating along with this test. */
    await sql("grant execute on function public.account_emails(uuid[]) to authenticated");
    try {
      const result = await practitioner.client.rpc("account_emails", {
        ids: [claimer.userId!],
      });

      expectAllowed(result);
      expect(
        result.data,
        "a widened grant let a practitioner read an unrelated account's address",
      ).toEqual([{ id: claimer.userId, email: claimerEmail }]);
    } finally {
      await sql("revoke execute on function public.account_emails(uuid[]) from authenticated");
    }
  });

  it("refuses the practitioner again once the grant is taken back", async () => {
    /* The `finally` above is load-bearing, and a test that only granted would
       leave the suite's later files running against a schema this file loosened.
       Asserted rather than assumed, because the failure would surface as an
       unrelated file passing for the wrong reason. */
    expectPermissionDenied(
      practitioner,
      await practitioner.client.rpc("account_emails", { ids: [claimer.userId!] }),
    );
  });
});

describe("what it resolves", () => {
  it("returns the address for an account that holds a profile", async () => {
    const result = await admin.client.rpc("account_emails", { ids: [practitioner.userId!] });
    expectAllowed(result);

    expect(result.data).toEqual([{ id: practitioner.userId, email: practitionerEmail }]);
  });

  it("returns the address for an account that holds no profile", async () => {
    /* The regression test for the decision not to narrow the population. The
       obvious extra guard is `exists (select 1 from practitioners where user_id
       = …)`, and it would break the caller this function was written for: an
       admin assigning a curated profile is looking up the person about to
       receive it, who owns nothing at the moment they are looked up. If this
       assertion ever fails, somebody added that guard. */
    const result = await admin.client.rpc("account_emails", { ids: [claimer.userId!] });
    expectAllowed(result);

    expect(result.data).toEqual([{ id: claimer.userId, email: claimerEmail }]);
  });

  it("resolves several accounts in one call", async () => {
    /* Why it takes an array at all: the review queue resolves every distinct
       `verified_by` on the screen, and one call per credential would be a
       request per row. */
    const result = await admin.client.rpc("account_emails", {
      ids: [practitioner.userId!, claimer.userId!],
    });
    expectAllowed(result);

    expect(sortByEmail(result.data!)).toEqual(
      sortByEmail([
        { id: practitioner.userId!, email: practitionerEmail },
        { id: claimer.userId!, email: claimerEmail },
      ]),
    );
  });

  it("drops an id that names no account, and keeps the rest", async () => {
    /* No null row and no placeholder, which is why the function returns a table
       of `(id, email)` rather than a column of addresses: the answer cannot be
       lined up with the argument by position, so a caller reads it by id. */
    const result = await admin.client.rpc("account_emails", {
      ids: [practitioner.userId!, absent],
    });
    expectAllowed(result);

    expect(result.data).toEqual([{ id: practitioner.userId, email: practitionerEmail }]);
  });

  it("returns one row for the same id passed twice", async () => {
    /* `= any(...)` is a membership test rather than a join against the array, so
       a duplicate does not duplicate the row. The caller de-duplicates anyway to
       keep the payload small, and this says it does not have to for
       correctness. */
    const result = await admin.client.rpc("account_emails", {
      ids: [practitioner.userId!, practitioner.userId!],
    });
    expectAllowed(result);

    expect(result.data).toHaveLength(1);
  });

  it("drops an account that carries no address", async () => {
    /* The test for `and u.email is not null`, which is the clause that decides
       what "no answer" looks like. Without it this id comes back as a row whose
       `email` is null, and every caller grows a third case to handle: a row that
       arrived carrying nothing. With it there are two cases rather than three,
       and the one the callers already handle.

       `auth.users.email` being nullable is what makes this reachable at all.
       Magic link fills it in practice, so this is the type's word against the
       product's habit, and the type is what the function has to survive. */
    const result = await admin.client.rpc("account_emails", { ids: [addressless.userId!] });
    expectAllowed(result);

    expect(result.data).toEqual([]);
  });

  it("keeps resolving the others when one of them carries no address", async () => {
    /* The dropped row takes nothing with it. Asserted separately because a
       `where` clause that accidentally became a `having`, or a join that turned
       inner, would pass the test above and empty the whole answer here. */
    const result = await admin.client.rpc("account_emails", {
      ids: [addressless.userId!, practitioner.userId!],
    });
    expectAllowed(result);

    expect(result.data).toEqual([{ id: practitioner.userId, email: practitionerEmail }]);
  });

  it("returns nothing for an empty array", async () => {
    /* The review queue's read reaches this whenever no credential on the screen
       has been checked. It short-circuits rather than calling, and this is what
       says the short circuit is an optimisation rather than a workaround. */
    const result = await admin.client.rpc("account_emails", { ids: [] });
    expectAllowed(result);

    expect(result.data).toEqual([]);
  });
});

/** A stable order for a comparison that does not care about row order. */
function sortByEmail(rows: { id: string | null; email: string | null }[]) {
  return [...rows].sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
}

/** The address an account actually carries, read as `postgres`. Setup, not an
    assertion: `auth.users` is unreachable over the API by anybody, which is the
    whole reason the function under test exists. */
async function addressOf(userId: string): Promise<string> {
  const [row] = await sql<{ email: string }>(
    "select email from auth.users where id = $1",
    [userId],
  );
  if (!row) throw new Error(`no account for ${userId}`);
  return row.email;
}

/** Writes a contact as `postgres` and returns its id. */
let contacts = 0;
async function seedContact(): Promise<string> {
  contacts += 1;
  const [row] = await sql<{ id: string }>(
    `insert into public.practitioner_contacts (contact_email)
     values ($1) returning id`,
    [`harness-account-emails-${contacts}@example.invalid`],
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
