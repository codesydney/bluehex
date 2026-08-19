import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/* Vite does not read `paths` out of tsconfig.json, so the alias the app imports
   through has to be restated here or every `@/…` import fails to resolve under the
   test runner. A `projects` array does not inherit the root `resolve` block either,
   so it is restated in both projects rather than declared once above them.

   The key is `@/` and not `@`. A bare `@` is a prefix match, so it would also
   swallow every scoped package — `@supabase/supabase-js` would be rewritten to
   `src/supabase/supabase-js` and fail to resolve. */
const alias = {
  "@/": fileURLToPath(new URL("./src/", import.meta.url)),
};

export default defineConfig({
  test: {
    /* Two projects, and they are run by different commands on purpose. `pnpm test`
       runs `src` alone, which is what CI runs; `pnpm test:db` runs `db`, which CI
       never does because there is no Docker on the runner and these tests need the
       local Supabase stack. Neither command runs the other's files, so a stopped
       stack cannot fail the suite CI gates on. */
    projects: [
      {
        resolve: { alias },
        test: {
          name: "src",
          /* Scan `src/` only, rather than the whole repository. Vitest's default
             include pattern is `**\/*.{test,spec}.*`, which matches Playwright's
             `e2e/*.spec.ts` — the two runners share a file extension and nothing
             else — and picks up whatever a `.spec.ts` in a git-ignored working
             directory happens to be. Both were observed: an unscoped run collected
             fourteen files out of `e2e/` and out of the worktrees under
             `.claude/worktrees/`, and failed on `test() called in the wrong place`.

             Scoping is a allowlist and an exclude list is a blocklist; the second
             needs a new entry every time somebody adds a directory, and it fails
             open when they don't. Application code lives in `src/`, so its tests do
             too. */
          dir: "src",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          /* Database tests are not application code, so they do not live under
             `src/`: they need a running Supabase stack, they talk to Postgres and
             PostgREST over the network, and they mutate global state — roles,
             grants, rows in `auth.users` — that no two files may touch at once. */
          dir: "tests/db",

          /* Sweeps every account a file created and closes the Postgres
             connection, so no test has to remember either. */
          setupFiles: ["./tests/db/harness/setup.ts"],

          /* Serial. Every file signs users up, grants and revokes privileges, and
             cleans up after itself; run in parallel they would delete each other's
             fixtures and see each other's grant changes. */
          fileParallelism: false,

          /* Longer than the default 5s. A sign-up is a bcrypt hash plus a token
             mint inside a container, and the first call of a run pays for a cold
             connection to Postgres as well. */
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
