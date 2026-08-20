/**
 * Runs in every file of the `db` project. Two jobs, both of which every test file
 * would otherwise have to remember.
 *
 * Cleanup is not tidiness: a leaked `auth.users` row is an account with an
 * unpredictable admin status still sitting in the database, and `sign_in_sign_ups`
 * is rate limited per IP, so a suite that leaks users is also one that eventually
 * cannot create them. Closing the Postgres connection is what stops a finished run
 * from hanging on an open socket.
 */

import { afterAll } from "vitest";

import { deleteCreatedUsers } from "./callers";
import { closeSql } from "./stack";

afterAll(async () => {
  try {
    await deleteCreatedUsers();
  } finally {
    await closeSql();
  }
});
