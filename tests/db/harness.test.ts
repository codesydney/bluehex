import { describe, expect, it } from "vitest";

import { site } from "@/lib/site";

/**
 * Proves the second Vitest project is wired up: that `pnpm test:db` finds a file
 * under `tests/db`, runs it, and resolves the `@/` alias the same way the `src`
 * project does. It asserts nothing about the database on purpose — the fixtures
 * do that.
 */
describe("the database test project", () => {
  it("is collected, and resolves the @/ alias", () => {
    /* The alias has to be restated per project — Vite does not read `paths` out
       of tsconfig.json, and a `projects` array does not inherit the root
       `resolve` block. Nothing else checks that the two projects agree. */
    expect(site.name).toBe("Bluehex");
  });
});
