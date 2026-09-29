import { expect, test } from "@playwright/test";

test("view binding preserves displayed inputs through comparison, navigation, and failures", async ({
  page,
}) => {
  let mode: "ready" | "empty" | "error" = "ready";
  const inputs: { range: { start: string; end: string }; comparison: unknown }[] = [];
  let release: (() => void) | undefined;
  let hold = true;
  await page.route("**/api/data/activity", async (route) => {
    inputs.push(route.request().postDataJSON());
    if (hold)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (mode === "error")
      return route.fulfill({
        status: 503,
        json: { error: { code: "source_unavailable", message: "Unavailable" } },
      });
    return route.fulfill({
      json: {
        data: { count: 120, features: mode === "empty" ? [] : ["Queries", "Insights"] },
        queriedAt: "2026-03-12T00:00:00Z",
        requestId: "fixture",
        queryIds: [],
      },
    });
  });
  await page.goto("/view");
  await expect(page.getByText("Loading activity…")).toBeVisible();
  await expect(page.getByTestId("shared-grid")).toBeVisible();
  expect(inputs[0]).toEqual({
    range: { start: "2026-03-10", end: "2026-03-12" },
    comparison: null,
  });
  hold = false;
  release?.();
  await expect(page.getByText("Results for Mar 10–12, 2026 UTC")).toBeVisible();
  await page
    .getByRole("button", { name: "Explore Activity across product features and organizations" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Recorded product actions.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Choose dates" }).click();
  await page.getByRole("checkbox", { name: /Compare with previous period/ }).check();
  await expect
    .poll(() => inputs.at(-1)?.comparison)
    .toEqual({ start: "2026-03-07", end: "2026-03-09" });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/compare=previous/);
  await page.goBack();
  await expect(page).not.toHaveURL(/compare=previous/);
  // A different requested period fails while the visible result keeps its original label.
  mode = "error";
  await page.evaluate(() => {
    history.pushState(null, "", "?start=2026-03-13&end=2026-03-15");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText("Results for Mar 10–12, 2026 UTC")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Mar 10–12, 2026 UTC");
  mode = "empty";
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No activity in this range")).toBeVisible();
  await expect(page.getByTestId("shared-grid")).toHaveCount(0);
  await page.reload();
  mode = "error";
  await page.reload();
  await expect(page.getByText("Couldn’t load results")).toBeVisible();
});

test("shared loading and ready layouts fit narrow containers in both themes", async ({
  page,
}, testInfo) => {
  let release: (() => void) | undefined;
  await page.route("**/api/data/activity", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      json: {
        data: { count: 120, features: ["Long feature names remain readable within their widget"] },
        queriedAt: "2026-03-12T00:00:00Z",
        requestId: "fixture",
        queryIds: [],
      },
    });
  });
  await page.goto("/view");
  await expect(page.getByText("Loading activity…")).toBeVisible();
  for (const width of [320, 550, 900]) {
    await page.setViewportSize({ width, height: 800 });
    const grid = await page.getByTestId("shared-grid").boundingBox();
    const support = await page.getByTestId("shared-support").boundingBox();
    if (width < 640) expect(Math.abs(support!.width - grid!.width)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  release?.();
  await expect(page.getByText("Results for Mar 10–12, 2026 UTC")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark theme" }).click();
    for (const width of [320, 550, 900]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`view-${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
});
