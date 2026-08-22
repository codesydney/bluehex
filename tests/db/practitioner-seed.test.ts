import { beforeAll, describe, expect, it } from "vitest";

import { anonCaller, type Caller } from "./harness/callers";
import { expectAllowed } from "./harness/result";
import { sql } from "./harness/stack";

/**
 * The invented population in `supabase/seed.sql` (#110), asserted as the branches
 * it exists to cover rather than as a list of eight people.
 *
 * Its sibling `credential-catalogue-seed.test.ts` deep-equals the JSON, because
 * those 24 rows are real reference data and a wrong label there is a wrong
 * credential name behind the Verified badge. Nothing here is real, so a deep equal
 * would only assert that somebody typed what they typed — and it would fail on
 * every edit to a bio, teaching the next person to update the expectation without
 * reading it. What is worth pinning is the *coverage*: the seed's whole purpose is
 * that a developer running `pnpm db:reset` can see every state the directory
 * renders, so the assertions are "a profile of this shape exists" and the failure
 * mode they catch is a fixture quietly losing a branch.
 *
 * **Nothing in `tests/db` is rewritten to lean on these rows.** Every other file
 * inserts what it needs as `bluehex_admin`, which proves the admin-only grant and
 * supplies the fixture in one statement; a test passing against seeded data is the
 * weaker assertion. This file is the exception because the seed is what it is
 * about, exactly as the catalogue's is.
 *
 * Read through `anon` wherever `anon` can see it, because that is the directory's
 * own read path and it is what a developer looking at the page will get. `status`
 * is the one fact `anon` holds no grant on, so the status spread is read through
 * `sql()` — a claim about what the seed contains, not about who may read it, and
 * the policies that decide the latter are asserted in `practitioners.test.ts`.
 *
 * A failure here means the seed lost a branch, or the stack under test was booted
 * without running `supabase/seed.sql` — never that the schema is wrong.
 */

/* The literal ids from `supabase/seed.sql`. Naming them is the point of their being
   literal: a `gen_random_uuid()` fixture cannot be pointed at from anywhere. */
const MARA = "22222222-0000-4000-8000-000000000001"; // approved, every credential verified
const TOBY = "22222222-0000-4000-8000-000000000002"; // approved, one credential unverified
const DEVON = "22222222-0000-4000-8000-000000000003"; // approved, holds nothing at all
const PRIYA = "22222222-0000-4000-8000-000000000004"; // approved, holds a certification
const HOLLIS = "22222222-0000-4000-8000-000000000005"; // approved, no credential verified
const INES = "22222222-0000-4000-8000-000000000006"; // pending
const RAFAEL = "22222222-0000-4000-8000-000000000007"; // rejected
const SABINE = "22222222-0000-4000-8000-000000000008"; // withdrawn, holds a verified credential

const PUBLISHED = [MARA, TOBY, DEVON, PRIYA, HOLLIS];
const UNPUBLISHED = [INES, RAFAEL, SABINE];
const SEEDED = [...PUBLISHED, ...UNPUBLISHED];

let anon: Caller;

beforeAll(() => {
  anon = anonCaller();
});

describe("the seeded population", () => {
  it("covers every `status` value", async () => {
    /* Through `sql()` rather than a caller: `status` is granted to `authenticated`
       and `bluehex_admin` and to `anon` never, so there is no caller who can both
       see all eight rows and read the column. The claim is about what the seed
       contains. */
    const rows = await sql<{ id: string; status: string }>(
      "select id::text, status::text from public.practitioners where id = any($1::uuid[])",
      [SEEDED],
    );

    expect(rows).toHaveLength(8);
    const byId = new Map(rows.map((row) => [row.id, row.status]));
    expect(byId.get(MARA)).toBe("approved");
    expect(byId.get(INES)).toBe("pending");
    expect(byId.get(RAFAEL)).toBe("rejected");
    expect(byId.get(SABINE)).toBe("withdrawn");
    /* All four, named individually rather than as a set, so that dropping the one
       nobody looks at — `rejected`, which is invisible in the directory and only
       shows up in a review queue — fails here rather than silently. */
    expect(new Set(rows.map((row) => row.status))).toEqual(
      new Set(["approved", "pending", "rejected", "withdrawn"]),
    );
  });

  it("leaves every seeded profile unclaimed, because the seed creates no accounts", async () => {
    /* Not a detail to tidy away later: a seeded `auth.users` row would be a
       credential pair committed to the repository, and there is no sign-in flow to
       use it with (#14). Unclaimed is a supported state — it is what curated intake
       produces — so the fixtures are honest rather than incomplete. Stated here so
       that the day somebody seeds an account, they do it deliberately. */
    const claimed = await sql<{ id: string }>(
      "select id::text from public.practitioners where id = any($1::uuid[]) and user_id is not null",
      [SEEDED],
    );

    expect(claimed).toEqual([]);
  });

  it("publishes the approved profiles to anon and hides the rest", async () => {
    const visible = await anon.client
      .from("practitioners")
      .select("id, name")
      .in("id", SEEDED);

    expectAllowed(visible);
    const ids = visible.data!.map((row) => row.id);
    expect(ids.sort()).toEqual([...PUBLISHED].sort());
    /* Named in both directions. A seed with nothing unpublished in it would make the
       directory's own filter untestable by looking at the page, which is what this
       file's fixtures are for. */
    for (const hidden of UNPUBLISHED) expect(ids).not.toContain(hidden);
  });
});

describe("the credential branches a profile can be in", () => {
  /** What `anon` may read of a credential, plus its catalogue entry's kind. */
  async function credentialsOf(profileId: string) {
    const result = await anon.client
      .from("practitioner_credentials")
      .select("id, verified, evidence_url_public, credential_catalogue(kind, label)")
      .eq("practitioner_id", profileId);

    expectAllowed(result);
    return result.data!;
  }

  it("has a published profile whose every credential is verified", async () => {
    const held = await credentialsOf(MARA);

    /* The profile-level badge is derived — at least one credential, and every
       credential verified — and is stored nowhere. This is the profile that earns
       it, and without one the rollup has nothing to be true of. */
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((row) => row.verified)).toBe(true);
  });

  it("has a published profile held back by a single unverified credential", async () => {
    const held = await credentialsOf(TOBY);

    /* "Every credential verified" and "any credential verified" read identically on
       a profile holding one, so a population without this profile cannot tell the
       correct rollup from the wrong one. */
    expect(held.some((row) => row.verified)).toBe(true);
    expect(held.some((row) => !row.verified)).toBe(true);
  });

  it("has a published profile whose credentials are all unverified", async () => {
    const held = await credentialsOf(HOLLIS);

    /* A credential is the practitioner's own claim; the badge is Bluehex's check of
       it. The two are separate ideas and this is what the gap looks like on screen. */
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((row) => !row.verified)).toBe(true);
  });

  it("has a published profile holding nothing at all", async () => {
    const held = await credentialsOf(DEVON);
    const offered = await anon.client
      .from("practitioner_services")
      .select("id")
      .eq("practitioner_id", DEVON);

    /* Approved, findable, carrying no badge and never falsely able to. A roster that
       made either absence look like a broken profile would be wrong about the
       population the directory launches with. */
    expect(held).toEqual([]);
    expectAllowed(offered);
    expect(offered.data).toEqual([]);
  });

  it("has exactly one published profile holding a Claude Certification", async () => {
    const certified: string[] = [];
    for (const profileId of PUBLISHED) {
      const held = await credentialsOf(profileId);
      if (held.some((row) => row.credential_catalogue?.kind === "certification")) {
        certified.push(profileId);
      }
    }

    /* `certified` is derived — "holds a credential whose catalogue entry is a Claude
       Certification" — rather than stored, so a population where every credential is
       an Academy course cannot tell the derivation from a constant `false`. One
       holder is also the honest shape of the market: the exams are new. */
    expect(certified).toEqual([PRIYA]);
  });

  it("shows an evidence link only where the practitioner opted in", async () => {
    const held = [...(await credentialsOf(MARA)), ...(await credentialsOf(TOBY))];

    /* `evidence_url_public` is the generated column that makes `evidence_public`
       enforceable rather than advisory: `anon` is granted it and never the raw
       `evidence_url`. A seed where the flag is always one way renders one branch and
       silently never the other, so both are present. */
    expect(held.some((row) => row.evidence_url_public !== null)).toBe(true);
    expect(held.some((row) => row.evidence_url_public === null)).toBe(true);
    for (const row of held) {
      if (row.evidence_url_public !== null) {
        expect(row.evidence_url_public.startsWith("https://")).toBe(true);
      }
    }
  });

  it("names a real catalogue entry from every seeded credential", async () => {
    /* The whole mechanism of "a practitioner cannot type a credential name": a
       credential references `credential_catalogue` and carries no free text. A seed
       whose `catalogue_id` resolved to something outside the 24 would be inventing
       one — impossible through the foreign key, but this also catches the seed
       having quietly reached for a row `tests/db` inserts and sweeps away. */
    const held = await sql<{ label: string }>(
      `select e.label
         from public.practitioner_credentials c
         join public.credential_catalogue e on e.id = c.catalogue_id
        where c.practitioner_id = any($1::uuid[])`,
      [SEEDED],
    );

    expect(held.length).toBeGreaterThan(0);
    expect(held.filter(({ label }) => label.startsWith("harness "))).toEqual([]);
  });
});

describe("the service branches a profile can be in", () => {
  it("carries both a catalogue service and a custom label", async () => {
    const offered = await anon.client
      .from("practitioner_services")
      .select("id, practitioner_id, catalogue_id, label")
      .in("practitioner_id", PUBLISHED);

    expectAllowed(offered);
    /* The two kinds render differently — a catalogue row drives the roster's filter
       chips and a custom label never becomes one — so a seed carrying only the first
       leaves the second undrawn. */
    expect(offered.data!.some((row) => row.catalogue_id !== null)).toBe(true);
    expect(offered.data!.some((row) => row.label !== null)).toBe(true);
  });

  it("puts one published profile at the cap of three", async () => {
    const offered = await anon.client
      .from("practitioner_services")
      .select("id")
      .eq("practitioner_id", MARA);

    expectAllowed(offered);
    /* A filter axis everybody maxes out is the failure the cap exists to prevent, so
       it should be visible on the roster rather than only in the form. Three is the
       cap `practitioner_services_cap` enforces; a fourth here would fail the reset. */
    expect(offered.data).toHaveLength(3);
  });

  it("hides the services of every unpublished profile", async () => {
    const hidden = await anon.client
      .from("practitioner_services")
      .select("id, practitioner_id")
      .in("practitioner_id", UNPUBLISHED);

    expectAllowed(hidden);
    /* The child follows its parent. Asserted against a seed where the unpublished
       profiles genuinely hold services and credentials, so the emptiness is the
       policy working rather than there being nothing to hide — the `pending` and
       `rejected` fixtures each carry one for exactly this reason. */
    expect(hidden.data).toEqual([]);
  });

  it("hides the credentials of every unpublished profile", async () => {
    const hidden = await anon.client
      .from("practitioner_credentials")
      .select("id, practitioner_id")
      .in("practitioner_id", UNPUBLISHED);

    expectAllowed(hidden);
    expect(hidden.data).toEqual([]);
  });
});
