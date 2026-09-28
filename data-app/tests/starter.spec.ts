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
  await expect(page.getByText("No terms for this view")).toBeVisible();
  await page.getByRole("tab", { name: "Queries" }).click();
  await expect(page.getByText("No SQL for this view")).toBeVisible();
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
  await expect(page.getByRole("group", { name: "Reporting period" })).toHaveCount(0);
  await expect(page).toHaveTitle("Orders exploration • Acme/production • Altertable app");
  await request.post("/__test/state", { data: "failure" });
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.getByText("Connection view ready")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/Couldn’t refresh. Showing the last result/);
  await expect(page.locator(".altertable-data-boundary-content")).toHaveAttribute(
    "data-stale-error",
    "true",
  );
});

test("card inspection inherits the page glossary and empty states", async ({ page }) => {
  await page.goto("/components");
  await expect(page.getByText("Connection view ready")).toBeVisible();
  await page.getByRole("button", { name: "Explore Completed orders" }).click();
  await expect(page.getByRole("dialog")).toContainText("Completed customer orders.");
  await page.getByRole("tab", { name: "Queries" }).click();
  await expect(page.getByRole("dialog")).toContainText("connection-check.sql");
});

test("request progress appears before Refresh", async ({ page }) => {
  await page.goto("/components");
  await expect(page.getByText("Connection view ready")).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/data/connection", async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh data" }).click();
  const status = page.locator(".altertable-refresh-status");
  await expect(status).toHaveText("Updating data");
  await expect(status).toBeVisible();
  const label = await status.boundingBox();
  const action = await page.getByRole("button", { name: "Cancel refresh" }).boundingBox();
  expect(label!.x + label!.width).toBeLessThan(action!.x);
  release();
  await expect(status).toBeEmpty();
});

test("variables sit below the header divider while actions stay in the header", async ({
  page,
}) => {
  await page.goto("/components");
  const header = page.locator(".altertable-app-header");
  const bar = page.getByRole("group", { name: "View variables" });
  const actions = header.getByRole("group", { name: "Page actions" });
  await expect(bar.getByLabel("Date range")).toBeVisible();
  await expect(actions.getByRole("button", { name: "Refresh data" })).toBeVisible();
  expect(await bar.evaluate((element) => element.previousElementSibling?.tagName)).toBe("HEADER");
  const headerBox = await header.boundingBox();
  const barBox = await bar.boundingBox();
  expect(barBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("mobile header pairs scope with actions and keeps the description below", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/components");
  const header = page.locator(".altertable-app-header");
  const title = header.getByRole("heading", { name: "Orders exploration" });
  const scope = header.locator(".altertable-app-header-context");
  const actions = header.getByRole("group", { name: "Page actions" });
  const description = header.locator(":scope > .altertable-app-header-heading > p");
  const titleBox = await title.boundingBox();
  const scopeBox = await scope.boundingBox();
  const actionsBox = await actions.boundingBox();
  const descriptionBox = await description.boundingBox();
  expect(scopeBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
  expect(Math.abs(scopeBox!.y - actionsBox!.y)).toBeLessThan(12);
  expect(descriptionBox!.y).toBeGreaterThanOrEqual(actionsBox!.y + actionsBox!.height);
  await page.screenshot({ path: testInfo.outputPath("mobile-header.png") });

  await page.setViewportSize({ width: 280, height: 844 });
  const narrowScope = await scope.boundingBox();
  const narrowActions = await actions.boundingBox();
  expect(narrowActions!.y).toBeGreaterThanOrEqual(narrowScope!.y + narrowScope!.height);
});

test("grid uses one gap and keeps shorter panels at content height", async ({ page }, testInfo) => {
  await page.goto("/components");
  const grid = page.getByTestId("layout-grid");
  const stackGap = await page
    .getByTestId("layout-stack")
    .evaluate((element) => getComputedStyle(element).gap);
  expect(stackGap).toBe("24px");
  const items = grid.locator(":scope > div");
  const short = await items.nth(0).boundingBox();
  const tall = await items.nth(1).boundingBox();
  expect(short).not.toBeNull();
  expect(tall).not.toBeNull();
  expect(short!.height).toBeLessThan(tall!.height);
  if (testInfo.project.name === "desktop") {
    expect(Math.round(tall!.x - short!.x - short!.width)).toBe(24);
  } else {
    expect(Math.round(tall!.y - short!.y - short!.height)).toBe(24);
  }
  const constrained = page.getByTestId("constrained-grid").locator(":scope > div");
  const firstNarrow = await constrained.nth(0).boundingBox();
  const secondNarrow = await constrained.nth(1).boundingBox();
  expect(Math.round(secondNarrow!.x)).toBe(Math.round(firstNarrow!.x));
  expect(Math.round(secondNarrow!.y - firstNarrow!.y - firstNarrow!.height)).toBe(24);
  const border = await page
    .locator(".altertable-app-header")
    .evaluate((element) => getComputedStyle(element).borderBottomWidth);
  expect(border).toBe("1px");
});

test("grid spans respond to their container at phone, tablet, and desktop widths", async ({
  page,
}) => {
  for (const width of [390, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/components");
    const primary = await page.getByTestId("primary-grid-item").boundingBox();
    const support = await page.getByTestId("support-grid-item").boundingBox();
    expect(primary).not.toBeNull();
    expect(support).not.toBeNull();
    if (width === 390) {
      expect(support!.y).toBeGreaterThanOrEqual(primary!.y + primary!.height);
    } else {
      expect(Math.round(primary!.y)).toBe(Math.round(support!.y));
      expect(primary!.width).toBeGreaterThan(support!.width * 1.8);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("initial loading keeps the grid shape without displaying snapshot values", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/data/connection", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/components");
  const loading = page.getByTestId("loading-skeleton-grid");
  await expect(loading.locator(".altertable-content-skeleton")).toHaveCount(2);
  await expect(loading.locator(".altertable-content-skeleton-row")).toHaveCount(8);
  await expect(page.getByText("Connection view ready")).toHaveCount(0);
  release();
  await expect(page.getByText("Connection view ready")).toBeVisible();
  await expect(loading).toHaveCount(0);
});

test("story gives its main visual more room and stacks evidence on phones", async ({
  page,
}, testInfo) => {
  await page.goto("/components");
  const story = page.getByTestId("layout-story");
  const lead = await story.locator(".altertable-story-section-lead").boundingBox();
  const visual = await story.locator(".altertable-story-section-visual").boundingBox();
  const support = await story.locator(".altertable-story-section-support").boundingBox();
  expect(lead).not.toBeNull();
  expect(visual).not.toBeNull();
  expect(support).not.toBeNull();
  expect(visual!.y).toBeGreaterThan(lead!.y);
  if (testInfo.project.name === "desktop") {
    expect(visual!.width).toBeGreaterThan(support!.width);
    expect(Math.round(visual!.y)).toBe(Math.round(support!.y));
  } else {
    expect(support!.y).toBeGreaterThanOrEqual(visual!.y + visual!.height);
  }
});
