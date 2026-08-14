import { expect, test } from "@playwright/test";

test("the menu contains keyboard focus and restores it after Escape", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Open menu" });

  await menuButton.focus();
  await menuButton.click();

  const menu = page.getByRole("dialog", { name: "Site menu" });
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();

  const firstMenuLink = menu.getByRole("link").first();
  await page.keyboard.press("Tab");
  await expect(firstMenuLink).toBeFocused();

  const menuLayerTabStops = page.locator(
    '[data-menu-layer] a[href], [data-menu-layer] button:not([disabled]), [data-menu-layer] [tabindex]:not([tabindex="-1"])',
  );
  const tabStopCount = await menuLayerTabStops.count();
  for (let step = 0; step < tabStopCount; step += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest("[data-menu-layer]"))),
    ).toBe(true);
  }
  await expect(firstMenuLink).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("an in-page menu link closes the overlay and reaches its section", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("dialog", { name: "Site menu" })
    .getByRole("link", { name: "Practitioners" })
    .click();

  await expect(page).toHaveURL(/\/#practitioners$/);
  await expect(page.getByRole("dialog", { name: "Site menu" })).toBeHidden();
  await expect(page.locator("#practitioners")).toBeInViewport();
});

test("the fixed menu button remains available when the header fades", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  const contactLink = page.getByRole("link", { name: "Say Hello" });

  await contactLink.focus();
  await page.evaluate(() => window.scrollTo(0, 100));

  await expect(header).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("the contact form submits without an HTTP navigation", async ({ page }) => {
  await page.goto("/contact");
  const originalUrl = page.url();
  const httpNavigations: string[] = [];
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      /^https?:/u.test(request.url())
    ) {
      httpNavigations.push(request.url());
    }
  });

  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Phone").fill("0400 000 000");
  await page.getByLabel("A few words about your project").fill("A small accessibility review.");
  await page.getByRole("button", { name: "Submit" }).click();
  await page.waitForTimeout(500);

  expect(httpNavigations).toEqual([]);
  await expect(page).toHaveURL(originalUrl);
});
