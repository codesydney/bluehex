import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sql } from "./harness/stack";

/**
 * What a table starts with, before any migration grants on it.
 *
 * Every grant list in `supabase/migrations/` is written on the assumption that a
 * table created by `postgres` is unreachable by the Data API roles until a column
 * is named — AGENTS.md's "fails closed, which is the right way round". That is
 * not a property of Postgres; it is the CLI's `api.auto_expose_new_tables`
 * setting, whose *unset* meaning has flipped once already (2.114 read unset as
 * `false`, 2.116 as `true`), and which the CLI says it removes on 2026-10-30.
 * `config.toml` pins it to `false`. This file is what notices if the pin stops
 * holding — a CLI bump that ignores it, or a contributor who deletes the line.
 *
 * Asserted against the catalogue rather than through a caller, deliberately:
 * the thing under test is the privilege a fresh table holds, and
 * `has_table_privilege` is that fact with nothing in between. Reading it through
 * PostgREST would also mean waiting on its schema cache to notice a table that
 * did not exist a moment ago, which is a timing assertion nobody asked for.
 */

const table = "public.default_privileges_probe";
const apiRoles = ["anon", "authenticated", "service_role"] as const;
const privileges = ["select", "insert", "update", "delete"] as const;

beforeAll(async () => {
  /* Dropped first rather than `if not exists`: a run that died between here and
     `afterAll` leaves the table behind, and one left by an older version of this
     file could carry a grant the assertions below would then be reading. */
  await sql(`drop table if exists ${table}`);
  await sql(`create table ${table} (id int primary key)`);
});

afterAll(async () => {
  await sql(`drop table if exists ${table}`);
});

describe("a table a migration creates", () => {
  it("is owned by postgres, so the default privileges under test are its own", async () => {
    const [row] = await sql<{ owner: string }>(
      "select pg_get_userbyid(relowner) as owner from pg_class where oid = $1::regclass",
      [table],
    );
    expect(row?.owner).toBe("postgres");
  });

  it.each(apiRoles)("is unreadable and unwritable by %s until granted", async (role) => {
    const held: string[] = [];
    for (const privilege of privileges) {
      const [row] = await sql<{ held: boolean }>(
        "select has_table_privilege($1, $2, $3) as held",
        [role, table, privilege],
      );
      if (row?.held) held.push(privilege);
    }
    expect(held, `${role} holds ${held.join(", ")} on a table nothing granted`).toEqual([]);
  });
});
