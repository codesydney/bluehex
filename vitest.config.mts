import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      /* Vite does not read `paths` out of tsconfig.json, so the alias the app
         imports through has to be restated here or every `@/…` import fails to
         resolve under the test runner.

         The key is `@/` and not `@`. A bare `@` is a prefix match, so it would
         also swallow every scoped package — `@supabase/supabase-js` would be
         rewritten to `src/supabase/supabase-js` and fail to resolve. */
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
    },
  },
  test: {
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
});
