import { expect, test } from "@playwright/test";

test("the small-screen calendar fills its panel and keeps the selected range legible", async ({
  page,
}) => {
  for (const width of [320, 390, 550]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/components");
    await page.getByRole("button", { name: "Choose dates" }).click();
    const popover = page.locator(".altertable-date-range-popover");
    await expect(popover.getByRole("group", { name: "Quick ranges" })).toBeVisible();
    const grid = popover.locator(".react-aria-CalendarGrid");
    const sizes = await page.evaluate(() => {
      const popup = document
        .querySelector(".altertable-date-range-popover")!
        .getBoundingClientRect();
      const calendar = document.querySelector(".react-aria-CalendarGrid")!.getBoundingClientRect();
      return {
        popup: popup.width,
        calendar: calendar.width,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(sizes.calendar).toBeGreaterThanOrEqual(sizes.popup - 28);
    expect(sizes.overflow).toBe(false);
    await expect(grid).toBeVisible();
    await expect(popover.getByText("Selected dates")).toBeVisible();
    await expect(popover.getByText("Sep 10–12, 2026")).toBeVisible();
    await expect(popover.getByText("3 days · UTC")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/components");
  await page.getByRole("button", { name: "Choose dates" }).click();
  const compare = page.getByRole("checkbox", { name: /Compare with previous period/ });
  await compare.scrollIntoViewIfNeeded();
  await expect(compare).toBeVisible();
});
