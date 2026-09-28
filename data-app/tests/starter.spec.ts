import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/__test/state", { data: "success" });
});

test("connection succeeds only after a query, then offers next steps and a theme button", async ({
  page,
}, testInfo) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/data/connection", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Checking connection…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected", exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Connected", exact: true })).toBeVisible();
  await expect(page.getByText("Choose a question", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("starter-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("starter-dark.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("failed checks offer retry and invalidate an earlier successful connection", async ({
  page,
  request,
}) => {
  await request.post("/__test/state", { data: "failure" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connection not verified" })).toBeVisible();
  await request.post("/__test/state", { data: "success" });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Connected", exact: true })).toBeVisible();
  await request.post("/__test/state", { data: "failure" });
  await page.getByRole("button", { name: "Check connection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connection not verified" })).toBeVisible();
  await expect(page.getByText(/An earlier query succeeded/)).toBeVisible();
});

test("About the data keeps exploration context and Glossary without Overview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore data" }).click();
  await expect(page.getByRole("tab", { name: "Glossary" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByText(/runs a lightweight query/)).toBeVisible();
});

test("Present mode retains navigation, deep links, inspection, and theme switching", async ({
  page,
}) => {
  await page.goto("/components");
  await page.getByRole("button", { name: "Present data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders increased" })).toBeVisible();
  await expect(page).toHaveURL(/present=1.*step=orders/);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "More returning customers" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "More returning customers" })).toBeVisible();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(dialog.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  await dialog.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Glossary" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Close panel" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("data view keeps the last result visible when refresh fails", async ({ page, request }) => {
  await request.post("/__test/state", { data: "failure" });
  await page.goto("/components");
  await expect(page.getByText("Couldn’t load data")).toBeVisible();
  await request.post("/__test/state", { data: "success" });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Connection view ready")).toBeVisible();
  await expect(page).toHaveTitle("Orders exploration • Acme/production • Altertable app");
  await request.post("/__test/state", { data: "failure" });
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByText("Connection view ready")).toBeVisible();
  await expect(page.getByText(/Couldn’t refresh. Showing the last result/)).toBeVisible();
});
