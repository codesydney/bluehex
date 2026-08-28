import { expect, test, type Page } from "@playwright/test";

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

/* The form sends through EmailJS from the browser. Every test below intercepts
   that call — an end-to-end run must never put a real enquiry in a real inbox,
   and the suite runs on every push. */
const EMAILJS = "https://api.emailjs.com/api/v1.0/email/send";

const fillEnquiry = async (page: Page) => {
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Phone").fill("0400 000 000");
  await page.getByLabel("A few words about your project").fill("A small accessibility review.");
};

test("the contact form submits without an HTTP navigation", async ({ page }) => {
  await page.route(EMAILJS, (route) => route.fulfill({ status: 200, body: "OK" }));
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

  await fillEnquiry(page);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("your message is on its way")).toBeVisible();
  expect(httpNavigations).toEqual([]);
  await expect(page).toHaveURL(originalUrl);
});

test("the contact form delivers the enquiry to EmailJS and clears itself", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  await page.route(EMAILJS, async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, body: "OK" });
  });

  await page.goto("/contact");
  await fillEnquiry(page);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("your message is on its way")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    template_params: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "0400 000 000",
    },
  });
  await expect(page.getByLabel("Your name")).toHaveValue("");
});

/* The one that matters. A refused send must never lose what the visitor wrote:
   the failure hands them a mailto with every field already in it. */
test("a refused send offers the enquiry as a mailto rather than dropping it", async ({ page }) => {
  await page.route(EMAILJS, (route) => route.fulfill({ status: 400, body: "Bad Request" }));

  await page.goto("/contact");
  await fillEnquiry(page);
  await page.getByRole("button", { name: "Submit" }).click();

  const fallback = page.getByRole("link", { name: "open it in your email app" });
  await expect(fallback).toBeVisible();

  const href = decodeURIComponent((await fallback.getAttribute("href")) ?? "");
  expect(href).toContain("mailto:info@code.sydney");
  expect(href).toContain("Name: Ada Lovelace");
  expect(href).toContain("A small accessibility review.");

  /* Nothing is cleared on failure — the visitor can press Submit again. */
  await expect(page.getByLabel("Your name")).toHaveValue("Ada Lovelace");
});
