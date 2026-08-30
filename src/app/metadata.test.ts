import { describe, expect, it, vi } from "vitest";
import { site } from "@/lib/site";

/**
 * A guard over the share card's wiring, which nothing else can catch.
 *
 * Deleting `metadataBase` does not fail the build, the type check or the
 * linter — every `og:image` quietly becomes a `localhost` URL that unfurls as
 * nothing, and the symptom surfaces weeks later in somebody else's feed. The
 * same is true of `twitter.card`: without it a 1200x630 image renders as a
 * small square thumbnail.
 *
 * It lives here rather than in `e2e/`, which would be the natural home for
 * asserting what a served page emits, because the `End-to-end tests` workflow
 * is disabled by hand — a guard there would gate nothing. `pnpm test` is what
 * the required check runs.
 */

/* `layout.tsx` calls `next/font/google` at module scope. It is a build-time
   transform rather than a runtime module, so importing the layout under Vitest
   throws without this. Only `variable` is read by the layout. */
vi.mock("next/font/google", () => ({
  Funnel_Display: () => ({ variable: "--font-funnel-display" }),
  Funnel_Sans: () => ({ variable: "--font-funnel-sans" }),
}));

const { metadata } = await import("./layout");

describe("root metadata", () => {
  it("resolves image paths against the canonical origin", () => {
    /* Relative metadata URLs resolve against this and nothing else — there is
       no per-route fallback, so its absence is silent rather than loud.

       Compared as a string rather than by `.origin`, because the field is typed
       `string | URL` and only one of those has an `origin`. The trailing slash
       is `URL`'s doing: `site.origin` deliberately carries none, and round
       tripping it through `new URL()` puts one back. */
    expect(metadata.metadataBase?.toString()).toBe(`${site.origin}/`);
  });

  it("asks for the large card, not a thumbnail", () => {
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});
