import { expect, test } from "@playwright/test";

test("gallery preserves control defaults, status, and keyboard selection", async ({ page }) => {
  await page.goto("/gallery");
  await expect(page.getByRole("heading", { name: "Runtime component gallery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disabled action", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Disabled categories: HTTP", exact: true }),
  ).toBeDisabled();
  const checkbox = page.getByRole("checkbox", { name: "Include archived records", exact: true });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await checkbox.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".altertable-checkbox")).toHaveCSS("outline-width", "1px");
  await page
    .getByRole("button", { name: "Loading categories: Choose categories", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Loading categories options" });
  await expect(dialog.getByText("Loading values…", { exact: true }).last()).toBeVisible();
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await dialog.getByRole("searchbox").press("Escape");
  await page.getByRole("button", { name: "Complete loading", exact: true }).click();
  await page
    .getByRole("button", { name: "Loading categories: Choose categories", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Loading categories options" });
  await expect(dialog.getByRole("option")).toHaveCount(3);
  await dialog.getByRole("searchbox").press("Escape");
  await page.getByRole("button", { name: "Failed categories: HTTP", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Failed categories options" });
  await expect(dialog.locator(".altertable-combobox-feedback")).toHaveText("Couldn’t load values");
  await expect(dialog.getByRole("option", { name: "Postgres", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.locator(".altertable-combobox-feedback")).toHaveCount(0);
  await dialog.getByRole("searchbox").press("Escape");
  await page.getByRole("button", { name: "Categories: Choose categories", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Categories options" });
  const search = dialog.getByRole("searchbox");
  await search.focus();
  await expect(dialog.locator(".altertable-search-input-wrap")).toHaveCSS("outline-width", "1px");
  await search.press("ArrowDown");
  await expect(dialog.getByRole("option", { name: "HTTP", exact: true })).toBeFocused();
  await expect(dialog.getByRole("option", { name: "HTTP", exact: true })).toHaveCSS(
    "outline-width",
    "1px",
  );
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(dialog.getByRole("option", { name: "Other", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Clear selection" }).click();
  await expect(dialog.getByRole("option", { name: "Other", exact: true })).toBeEnabled();
  await search.fill("does not exist");
  await expect(dialog.getByText("No matching values", { exact: true }).last()).toBeVisible();
});

test("gallery widget and inspection share selected bars and view changes", async ({ page }) => {
  await page.goto("/gallery");
  const widget = page
    .locator(".altertable-data-widget")
    .filter({ has: page.getByRole("heading", { name: "Weekly activity", exact: true }) });
  await widget.getByRole("button", { name: "Tuesday: 0 events", exact: true }).click();
  const trigger = widget.getByRole("button", { name: "Explore Weekly activity" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Weekly activity", exact: true });
  await expect(
    sheet.getByRole("button", { name: "Tuesday: 0 events", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Wednesday: 8 events", exact: true }).click();
  await sheet.getByRole("tab", { name: "Summary", exact: true }).click();
  await expect(sheet.getByText("20 events this week", { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect(trigger).toBeFocused();
  const body = widget.locator(":scope > .altertable-data-widget-body");
  await expect(body.getByRole("tab", { name: "Summary", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await body.getByRole("tab", { name: "Chart", exact: true }).click();
  await expect(
    body.getByRole("button", { name: "Wednesday: 8 events", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("gallery uses shared defaults in both themes and narrow containers", async ({ page }) => {
  await page.goto("/gallery");
  const action = page.getByRole("button", { name: "Hint action", exact: true });
  const backgrounds: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await expect
        .poll(() => action.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(backgrounds[0]);
    }
    const surfaceColor = await page
      .locator(".altertable-data-widget")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(action).toHaveCSS("background-color", surfaceColor);
    backgrounds.push(surfaceColor);
    await action.press("Tab");
    await action.focus();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(action).toHaveAttribute(
      "aria-describedby",
      (await tooltip.getAttribute("id")) ?? "",
    );
    await expect(action).toHaveCSS("outline-width", "1px");
    await action.press("Escape");
    await expect(tooltip).not.toBeVisible();
    const narrow = page.getByTestId("narrow-controls");
    const bounds = await narrow.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
    await page.screenshot({
      path: `/tmp/runtime-gallery-${test.info().project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  expect(backgrounds[0]).not.toBe(backgrounds[1]);
});
