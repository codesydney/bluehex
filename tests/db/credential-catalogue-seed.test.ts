import { beforeAll, describe, expect, it } from "vitest";

import { anonCaller, type Caller } from "./harness/callers";
import { expectAllowed } from "./harness/result";

import catalogue from "../../supabase/seed/credential-catalogue.json";

/**
 * The drift guard between `supabase/seed/credential-catalogue.json` and what is
 * actually in the database after a reset.
 *
 * The 24 real Claude credentials live in two files: the JSON is the canonical
 * record, portable to wherever the catalogue is eventually housed, and
 * `supabase/seed.sql` is one loader for it. Two copies of the same 24 strings is
 * exactly the arrangement that rots silently — a label corrected in one and not the
 * other is a wrong credential name behind the Verified badge, and nothing else in
 * the repository would notice. This file is what makes the split safe to have.
 *
 * It asserts the *loaded* state, not the migration. `20260820201450_catalogues.sql`
 * still creates `credential_catalogue` empty on purpose, and `tests/db/catalogues.test.ts`
 * covers the table's grants and policies without assuming any row exists. So a
 * failure here means the seed and the JSON disagree, or the stack under test was
 * booted without running `supabase/seed.sql` — never that the schema is wrong. Both
 * supported paths do run it: `pnpm db:reset` locally, and the `supabase start` in
 * `.github/workflows/schema.yml`.
 */

let anon: Caller;

beforeAll(() => {
  anon = anonCaller();
});

describe("credential_catalogue seed", () => {
  it("loads every row in `credential-catalogue.json`, in order", async () => {
    /* Read as `anon` through the granted columns, which is also the only way the
       picker will ever read this table. `id`, `created_at` and `updated_at` are
       left out: two are ungranted and the third is a uuid the JSON cannot know. */
    const loaded = await anon.client
      .from("credential_catalogue")
      .select("source, label, active, sort_order")
      .not("label", "like", "harness %")
      .order("source")
      .order("sort_order");

    expectAllowed(loaded);
    /* "Anthropic Academy" sorts before "Claude Certification", so ordering by
       source and then `sort_order` is the JSON's own order. Deep-equal rather than
       a set comparison: `sort_order` is what a grouped picker renders by, so a row
       in the wrong position is a real defect. */
    expect(loaded.data).toEqual(
      catalogue.map(({ source, label, sortOrder }) => ({
        source,
        label,
        active: true,
        sort_order: sortOrder,
      })),
    );
  });

  it("carries 24 rows split 20 Academy to 4 Certification", async () => {
    const loaded = await anon.client
      .from("credential_catalogue")
      .select("source, label, sort_order")
      .not("label", "like", "harness %");

    expectAllowed(loaded);
    /* Stated separately from the deep-equal above, which would go on passing if
       somebody deleted rows from both files at once. These counts are the shape of
       the two published pages, so they change only when Anthropic's do. */
    expect(loaded.data).toHaveLength(24);
    expect(
      loaded.data?.filter((row) => row.source === "Anthropic Academy"),
    ).toHaveLength(20);
    expect(
      loaded.data?.filter((row) => row.source === "Claude Certification"),
    ).toHaveLength(4);

    /* `sort_order` restarts at 0 per source, so exactly two rows hold each value
       the shorter list reaches. `unique (source, label)` does not constrain
       `sort_order` at all, which is what makes this worth asserting rather than
       assuming. */
    expect(loaded.data?.filter((row) => row.sort_order === 0)).toHaveLength(2);
    expect(loaded.data?.filter((row) => row.sort_order === 19)).toHaveLength(1);
  });

  it("uses no label the `harness ` sweep would delete", async () => {
    /* `tests/db/catalogues.test.ts` clears its fixtures in `afterEach` with
       `delete … where label like 'harness %'`. A seeded row named that way would be
       swept out from under this file — and the suite runs serially, so it would
       fail depending on file order rather than on anything real. */
    expect(catalogue.filter(({ label }) => label.startsWith("harness "))).toEqual([]);
  });
});
