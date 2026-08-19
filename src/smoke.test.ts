import { describe, expect, it } from "vitest";

import { site } from "@/lib/site";

/**
 * Proves the runner is wired up — that `pnpm test` finds a file, runs it, and
 * exits non-zero when an assertion fails. It tests nothing real on purpose.
 *
 * #56 deletes this when the first real test lands, along with the toolchain
 * this deliberately does without: React Testing Library, a DOM environment and
 * the React plugin.
 */
describe("the test runner", () => {
  it("runs", () => {
    expect(1).toBe(1);
  });

  it("resolves the @/ alias", () => {
    /* The import above is the assertion; nothing else in the repo checks that
       `resolve.alias` in vitest.config.mts still matches tsconfig's `paths`. */
    expect(site.name).toBe("Bluehex");
  });
});
