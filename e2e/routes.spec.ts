import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/* The home page's `h1` read "Claude Specialists." from before #53 until #157
   moved Agent Exchange onto `/` and the practitioner directory onto
   `/practitioners`, carrying its old heading with it. */
const routes = [
  { path: "/", heading: "Agent Exchange." },
  { path: "/practitioners", heading: "Claude Specialists." },
  { path: "/meetups", heading: "Meetups." },
  { path: "/contact", heading: "Let's talk about your project!" },
] as const;

async function expectNoStructuralAccessibilityViolations(page: Page) {
  // The existing palette has known WCAG contrast failures. Keep this harness focused on
  // structural regressions; remediating the visual palette belongs in a dedicated design change.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(results.violations).toEqual([]);
}

for (const route of routes) {
  test(`${route.path} renders its primary heading`, async ({ page }) => {
    const response = await page.goto(route.path);

    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
  });

  test(`${route.path} has no structural accessibility violations`, async ({ page }) => {
    await page.goto(route.path);
    await expectNoStructuralAccessibilityViolations(page);
  });
}

test("an unknown route renders the 404 page", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "This page could not be found." })).toBeVisible();
  await expectNoStructuralAccessibilityViolations(page);
});

/**
 * The practitioner directory with nothing in it.
 *
 * Since #53 the roster is a query rather than an empty array, and this build has
 * no Supabase configured — which is the sanctioned degradation, not an accident:
 * `pnpm build` has to stay green on a clean clone and in the `Quality` check.
 * What that produces has to be exactly what the page shipped before the query
 * existed, because the empty directory is the state production is actually in.
 *
 * The invitation is the page's only call to action when there is nothing to
 * list, so losing it is the regression worth a test of its own.
 */
test("an empty practitioner directory renders the invitation rather than nothing", async ({
  page,
}) => {
  await page.goto("/practitioners#practitioners");

  await expect(page.getByText("The first profiles are being verified now.")).toBeVisible();
  await expect(page.getByText("Your profile here")).toBeVisible();
  await expect(page.getByText("Certified, or working towards it.")).toBeVisible();

  /* No rows, and therefore no filter chips: every filter group gates on its own
     source data, so a chip that could only ever return nothing is not drawn. */
  await expect(page.getByRole("button", { name: "Verified only" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^View profile/ })).toHaveCount(0);
});

/**
 * The Agent Exchange roster, which unlike the practitioner directory is never
 * anything but empty until an agent clears manual review — see `@/lib/agents`.
 * This is the state production actually ships #157 in, and it is the only
 * state this suite can assert, since there is no database to seed.
 */
test("an empty agent directory renders the invitation rather than nothing", async ({ page }) => {
  await page.goto("/#agents");

  await expect(page.getByText("The first agents are being reviewed now.")).toBeVisible();
  await expect(page.getByText("Your agent here")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Visit/ })).toHaveCount(0);
});

/**
 * The Meetups page renders one of exactly two states, and never a third:
 * either the live feed produced a next event, or it did not and the fallback
 * explanation shows instead — see `@/lib/events`'s invariant that a Meetup
 * outage must degrade rather than break the page. This build's own network
 * access decides which one below actually renders, which is why the
 * assertion is "one of the two" rather than either on its own.
 */
test("the Meetups page shows a next event or the fallback, never neither", async ({ page }) => {
  const response = await page.goto("/meetups#meetups");

  expect(response?.ok()).toBe(true);

  const nextMeetup = page.getByText("Next meetup");
  const fallback = page.getByText("Nothing scheduled right now.");
  await expect(nextMeetup.or(fallback)).toBeVisible();
});
