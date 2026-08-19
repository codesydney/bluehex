/**
 * Reading the result of a refused request.
 *
 * This is one helper rather than an assertion repeated in every test because the
 * obvious way to write it is wrong, and wrong in a way that still passes.
 * PostgREST answers **401 for `anon` and 403 for a signed-in caller on the same
 * underlying `permission denied`** — the status code reports *who asked*, not what
 * was decided. So `expect(status).toBe(403)` reads like an authorization assertion
 * and is really an assertion that the caller held a token; swap the caller and it
 * fails for a reason that has nothing to do with the privilege under test, and a
 * test written the other way round passes for a caller who was never authorized at
 * all.
 *
 * What the outcome actually is lives in the SQLSTATE the body carries: `42501` is
 * `insufficient_privilege`, and no status code distinguishes it from the other
 * things a 403 can mean. Some of the rules here have no status code at all — the
 * ownership state machine's `A → B` transition raises `23514`, which arrives as a
 * 400 alongside every other bad request — so the harness has to be able to assert
 * on the code directly as well.
 */

import { expect } from "vitest";

import type { Caller } from "./callers";

/** SQLSTATEs the schema's rules are expressed in. */
export const sqlstate = {
  /** `insufficient_privilege` — a grant, or the absence of one. */
  insufficientPrivilege: "42501",
  /** `check_violation` — a check constraint, or a trigger raising with it. */
  checkViolation: "23514",
  /** `foreign_key_violation` — a reference to a row that is not there. */
  foreignKeyViolation: "23503",
  /** `unique_violation` — the same thing claimed twice. */
  uniqueViolation: "23505",
  /** `not_null_violation` — a column the design refuses to leave empty. */
  notNullViolation: "23502",
} as const;

/**
 * The shape both PostgREST result types share. Written out rather than imported
 * as `PostgrestResponse` so that a builder, an awaited response and a hand-rolled
 * `fetch` wrapper are all accepted.
 */
export type Result = {
  readonly status: number;
  readonly error: { readonly code: string; readonly message: string } | null;
};

function describeResult(result: Result): string {
  return result.error
    ? `${result.status} ${result.error.code} ${result.error.message}`
    : `${result.status} with no error`;
}

/**
 * Asserts the request was refused for want of privilege, and that the status code
 * matches **who asked** rather than whatever the test author expected to see.
 *
 * Pass the caller that made the request: the helper derives the status from it, so
 * moving an assertion from one fixture to another cannot silently change what is
 * being proved.
 */
export function expectPermissionDenied(caller: Caller, result: Result): void {
  const expected = caller.authenticated ? 403 : 401;

  expect(
    { code: result.error?.code, status: result.status },
    `${caller.label}: expected permission denied (${sqlstate.insufficientPrivilege}) ` +
      `as ${expected}, got ${describeResult(result)}`,
  ).toEqual({ code: sqlstate.insufficientPrivilege, status: expected });
}

/**
 * Asserts the request was refused by Postgres with a particular SQLSTATE. Use it
 * for every rule a status code cannot tell you about — a check constraint, a
 * trigger that raises, a foreign key.
 */
export function expectSqlstate(result: Result, code: string): void {
  expect(
    result.error?.code,
    `expected SQLSTATE ${code}, got ${describeResult(result)}`,
  ).toBe(code);
}

/** Asserts the request succeeded. Fails with the error rather than with `null`. */
export function expectAllowed(result: Result): void {
  expect(result.error, `expected success, got ${describeResult(result)}`).toBeNull();
}
