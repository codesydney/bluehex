/**
 * Where the local Supabase stack is, and how to talk to Postgres directly.
 *
 * The defaults are the local stack's, and they are constants rather than
 * per-machine values: the CLI compiles them into its own binary, so every
 * contributor's `supabase start` prints these exact strings. `.env.example` makes
 * the same argument for the same keys at more length. They protect nothing — the
 * stack they open is bound to 127.0.0.1 on a developer's own machine — and every
 * one of them is overridable for anyone whose ports differ.
 *
 * These tests deliberately do not read `.env.local`. The app's environment names a
 * Supabase project, which one day is the hosted one; running a suite that revokes
 * grants and deletes users against it would be a bad afternoon. Pointing these
 * somewhere else has to be a typed-out decision, not a file that happens to be
 * lying around.
 */

import { Client } from "pg";

/** PostgREST and GoTrue. */
export const apiUrl = process.env.SUPABASE_TEST_API_URL ?? "http://127.0.0.1:54321";

/** The publishable key. Not a secret; see `.env.example`. */
export const publishableKey =
  process.env.SUPABASE_TEST_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

/**
 * Postgres, as the `postgres` superuser.
 *
 * This is the other half of the harness and it is not an escape hatch. Some of
 * what the schema promises is unreachable over HTTP by anybody: `public.admins`
 * has no grant to any API role, so an admin fixture cannot be created through
 * PostgREST at all, and the backstop assertion the spec calls the most valuable in
 * the suite — revoke a column grant, confirm the write is refused, re-grant it by
 * hand and confirm the trigger still refuses it — is a `grant` statement by
 * definition. AGENTS.md's rule is that authorization is row level security and
 * queries go through the Supabase client; direct SQL stays right where RLS was
 * never the control, which is a migration, a background job, or this.
 *
 * The rule for tests written on top of it: **assert through a caller, set up
 * through SQL.** A test that checks its outcome by re-reading the row as
 * `postgres` proves nothing about the policies, because `postgres` bypasses them.
 */
export const databaseUrl =
  process.env.SUPABASE_TEST_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * The error both seams raise when the stack is not answering.
 *
 * It lives here rather than inline because Postgres is not the seam a run reaches
 * first: a test file builds its callers before it touches the database, so a
 * stopped stack surfaces as a failed sign-up against GoTrue. A message that names
 * `pnpm db:start` is only useful if it is the one the reader actually gets.
 */
export function stackUnreachable(what: string, where: string, cause: unknown): Error {
  return new Error(
    `Cannot reach ${what} at ${where}. The database tests need the local Supabase ` +
      "stack — start it with `pnpm db:start`. This is why they are a separate " +
      "Vitest project and why CI does not run them.",
    { cause },
  );
}

let connection: Promise<Client> | undefined;

async function connect(): Promise<Client> {
  const next = new Client({ connectionString: databaseUrl });
  try {
    await next.connect();
  } catch (cause) {
    throw stackUnreachable("Postgres", databaseUrl, cause);
  }
  return next;
}

function client(): Promise<Client> {
  /* The promise is memoised, not the client it resolves to. Caching the resolved
     client leaves a window: two calls arriving before the first `connect()`
     settles both open a connection, and only the later one is reachable to close,
     so the earlier one stays open and keeps the Vitest worker alive. A failed
     attempt clears itself, or one unreachable moment would be cached for the rest
     of the run. */
  connection ??= connect().catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

/** Runs one statement as `postgres`, and returns its rows. */
export async function sql<Row extends Record<string, unknown>>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await (await client()).query<Row>(text, [...values]);
  return result.rows;
}

/**
 * Closes the connection. Vitest keeps the worker alive while a socket is open, so
 * without this a run that has touched Postgres hangs after the last assertion.
 */
export async function closeSql(): Promise<void> {
  const open = connection;
  connection = undefined;
  /* Settle the attempt before ending it: a run whose connect failed has nothing
     to close, and one still connecting must be waited for rather than abandoned
     — abandoning it is how the socket this function exists to close survives. */
  await open?.then((client) => client.end()).catch(() => undefined);
}
