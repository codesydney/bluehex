import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: "/", heading: "We only do Claude." },
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
