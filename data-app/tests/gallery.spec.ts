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
  await expect(page.locator(".altertable-checkbox").first()).toHaveCSS("outline-width", "1px");
  await page
    .getByRole("button", { name: "Loading categories: Choose categories", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Loading categories options" });
  await expect(dialog.locator(".altertable-combobox-skeletons")).toBeVisible();
  await expect(dialog.locator(".altertable-search-input-spinner")).toBeVisible();
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await dialog.getByRole("searchbox").press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Complete loading", exact: true }).click();
  await page
    .getByRole("button", { name: "Loading categories: Choose categories", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Loading categories options" });
  await expect(dialog.getByRole("option")).toHaveCount(3);
  await dialog.getByRole("searchbox").press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Failed categories: HTTP", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Failed categories options" });
  await expect(dialog.locator(".altertable-request-hint-message")).toHaveText(
    "Couldn’t load values",
  );
  await expect(dialog.getByRole("option", { name: "Postgres", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.locator(".altertable-request-hint-message")).toHaveCount(0);
  await dialog.getByRole("searchbox").press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Categories: Choose categories", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Categories options" });
  const search = dialog.getByRole("searchbox");
  const missing = dialog.getByRole("option", { name: "No value Records without a category value" });
  await expect
    .poll(() => missing.evaluate((element) => getComputedStyle(element, "::before").borderTopWidth))
    .toBe("1px");
  await expect(missing).toHaveCSS(
    "border-radius",
    await dialog
      .getByRole("option", { name: "HTTP", exact: true })
      .evaluate((element) => getComputedStyle(element).borderRadius),
  );
  await page.screenshot({ path: `/tmp/runtime-gallery-divider-${test.info().project.name}.png` });
  await search.fill("No value");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect
    .poll(() => missing.evaluate((element) => getComputedStyle(element, "::before").borderTopWidth))
    .toBe("0px");
  await search.fill("");
  await search.focus();
  await expect(dialog.locator(".altertable-search-input-wrap")).toHaveCSS("outline-style", "none");
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
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Categories: Choose categories", exact: true }).click();
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
  await expect(
    sheet.getByText(
      "20 events this week, concentrated on Monday and Wednesday. Tuesday had no recorded activity.",
      { exact: true },
    ),
  ).toBeVisible();
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

test("picker refresh and failure keep cached choices and retry in fixed slots", async ({
  page,
}) => {
  await page.goto("/gallery");
  await page.getByRole("button", { name: "Start picker cycle", exact: true }).click();
  await page.getByRole("button", { name: "Cycling categories: HTTP", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cycling categories options" });
  const option = dialog.getByRole("option", { name: "HTTP", exact: true });
  const input = dialog.getByRole("searchbox");
  // The panel can reposition at viewport edges; cached choices stay fixed inside it.
  const optionOffset = async () =>
    (await option.boundingBox())!.y - (await dialog.boundingBox())!.y;
  const initial = await optionOffset();
  await expect(dialog.locator(".altertable-search-input-spinner")).toBeVisible();
  await expect(input).toBeFocused();
  expect(Math.abs((await optionOffset()) - initial)).toBeLessThanOrEqual(1);
  const hint = dialog.locator(".altertable-request-hint");
  await expect(hint).toHaveAttribute("data-state", "error");
  await expect(option).toBeEnabled();
  expect(Math.abs((await optionOffset()) - initial)).toBeLessThanOrEqual(1);
  const message = await hint.locator(".altertable-request-hint-message").boundingBox();
  const retry = await hint.getByRole("button", { name: "Try again" }).boundingBox();
  expect(retry!.y).toBeGreaterThan(message!.y + message!.height);
  const hintBox = await hint.boundingBox();
  expect(
    Math.abs(retry!.x + retry!.width / 2 - (hintBox!.x + hintBox!.width / 2)),
  ).toBeLessThanOrEqual(1);
  await hint.getByRole("button", { name: "Try again" }).click();
  await expect(hint).toHaveCount(0);
  expect(Math.abs((await optionOffset()) - initial)).toBeLessThanOrEqual(1);
});

test("widget refresh slots preserve data, geometry and inspection feedback", async ({ page }) => {
  await page.goto("/gallery");
  const widget = page
    .locator(".altertable-data-widget")
    .filter({ has: page.getByRole("heading", { name: "Stable activity", exact: true }) });
  const body = widget.locator(":scope > .altertable-data-widget-body");
  const initial = await body.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  const bounds = await widget.boundingBox();
  for (const button of [
    "Widget updating",
    "Widget failed",
    "Long widget failure",
    "Widget ready",
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    expect(
      Math.abs(
        (await body.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)) -
          initial,
      ),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs((await widget.boundingBox())!.height - bounds!.height)).toBeLessThanOrEqual(1);
    await expect(body).toContainText("42 events remain visible.");
  }
  await page.getByRole("button", { name: "Widget failed", exact: true }).click();
  await widget.getByRole("button", { name: "Explore Stable activity" }).click();
  const sheet = page.getByRole("dialog", { name: "Stable activity", exact: true });
  await expect(sheet.getByRole("alert")).toContainText("Couldn’t refresh");
  await sheet.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(sheet.locator(".altertable-widget-status")).toHaveAttribute("data-state", "idle");
});

test("gallery spans all UI families and handles empty, overflow and request recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/gallery");
  expect(await page.locator(".gallery-case").count()).toBeGreaterThanOrEqual(65);
  await page.getByRole("button", { name: "Many categories: Category 100", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Many categories options" });
  await expect(picker.getByRole("option")).toHaveCount(100);
  const scroll = picker.locator(".altertable-combobox-options");
  expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await picker.getByRole("searchbox").fill("nonexistent");
  await expect(picker.locator(".altertable-combobox-empty")).toHaveText("No matching values");
  await picker.getByRole("searchbox").press("Escape");
  await page.keyboard.press("Escape");
  const request = page.getByRole("region", { name: "Fixture request", exact: true });
  await page.getByRole("button", { name: "loading", exact: true }).click();
  await expect(request.locator(".altertable-content-skeleton")).toBeVisible();
  await page.getByRole("button", { name: "error", exact: true }).click();
  await request.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(request).toContainText("42 recorded events");
  await page.getByRole("button", { name: "empty", exact: true }).click();
  await expect(request.getByText("No records", { exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  expect(errors).toEqual([]);
});

test("gallery respects reduced motion and retry without cached data", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/gallery");
  await page.getByRole("button", { name: "Refreshing categories: HTTP", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Refreshing categories options" });
  await expect(dialog.locator(".altertable-search-input-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
  await dialog.getByRole("searchbox").press("Escape");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "No cached categories: Select categories", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "No cached categories options" });
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t load values");
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.locator(".altertable-combobox-skeletons")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(dialog.getByRole("option")).toHaveCount(3);
  await dialog.getByRole("searchbox").press("Escape");
  await page.keyboard.press("Escape");
  const title = page.getByText("Nothing to show yet", { exact: true });
  const description = page.getByText("A description has quieter typography than its title.", {
    exact: true,
  });
  expect(await title.evaluate((element) => getComputedStyle(element).fontWeight)).toBe("600");
  expect(
    await title.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThan(
    await description.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  );
});

test("clear closes the picker and idle panels have no feedback gap", async ({ page }) => {
  await page.goto("/gallery");
  await page.getByRole("button", { name: "Resettable category: HTTP", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Resettable category options" });
  await expect(dialog.locator(".altertable-request-hint")).toHaveCount(0);
  await dialog.getByRole("option", { name: "Postgres", exact: true }).click();
  await page.getByRole("button", { name: "Resettable category: Postgres", exact: true }).click();
  await dialog.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Resettable category: HTTP", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Compact ghost action", exact: true }),
  ).toHaveAttribute("data-variant", "ghost");
  await expect(
    page.getByRole("button", { name: "Compact ghost action", exact: true }),
  ).toHaveAttribute("data-size", "compact");
});

test("widget toolbar owns shimmer, retry tooltip and stable action positions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/gallery");
  const widget = page
    .locator(".altertable-data-widget")
    .filter({ has: page.getByRole("heading", { name: "Stable activity", exact: true }) });
  const toolbar = widget.locator(".altertable-data-widget-help");
  const status = toolbar.locator(":scope > .altertable-widget-status");
  const inspect = widget.getByRole("button", { name: "Explore Stable activity" });
  const initial = await inspect.boundingBox();
  await page.getByRole("button", { name: "Widget updating", exact: true }).click();
  await expect(toolbar.getByRole("status")).toHaveText("Refreshing");
  await expect(toolbar).toHaveCSS("opacity", "1");
  await expect(status.locator("svg")).toHaveCount(0);
  await expect(status.locator(".altertable-widget-status-shimmer")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.getByRole("button", { name: "Widget failed", exact: true }).click();
  expect(Math.abs((await inspect.boundingBox())!.x - initial!.x)).toBeLessThanOrEqual(1);
  const retry = status.getByRole("button", { name: "Retry", exact: true });
  await inspect.focus();
  await inspect.press("Tab");
  await expect(retry).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("Try again to refresh these results.");
  await page.screenshot({ path: `/tmp/runtime-toolbar-retry-${test.info().project.name}.png` });
  await retry.click();
  await expect(status).toHaveAttribute("data-state", "idle");
});

test("widgets keep inspection on headings and suppress unneeded empty chrome", async ({ page }) => {
  await page.goto("/gallery");
  const widget = page
    .locator(".altertable-data-widget")
    .filter({ has: page.getByRole("heading", { name: "Stable activity", exact: true }) });
  const heading = widget.getByRole("heading", { name: "Stable activity", exact: true });
  await expect(heading.getByRole("button", { name: "Explore Stable activity" })).toBeVisible();
  await expect(
    widget.locator(".altertable-data-widget-help .altertable-widget-heading-trigger"),
  ).toHaveCount(0);
  const table = page
    .locator(".altertable-data-widget")
    .filter({ has: page.getByRole("heading", { name: "Stable table", exact: true }) });
  await expect(table.getByRole("navigation", { name: "Table pages" })).toHaveCount(0);
  const emptyChart = page
    .locator(".gallery-case")
    .filter({ has: page.getByRole("heading", { name: "Empty chart", exact: true }) });
  await expect(emptyChart.locator(".altertable-selectable-bars-help")).toHaveCount(0);
  const error = page.locator('.altertable-status-panel[data-status="error"]').first();
  await expect(error).toHaveCSS("border-top-width", "0px");
  await page.getByRole("button", { name: "Resettable category: HTTP", exact: true }).click();
  const search = page
    .getByRole("dialog", { name: "Resettable category options" })
    .locator(".altertable-search-input-wrap");
  await expect(search).toHaveCSS("border-top-width", "0px");
  await expect(search).toHaveCSS("border-bottom-width", "1px");
  const divider = await search.evaluate((element) => getComputedStyle(element).borderBottomColor);
  await expect(search.locator(":scope > svg")).toHaveCSS("opacity", "1");
  await search.getByRole("searchbox").press("ArrowDown");
  await expect(search).toHaveCSS("border-bottom-color", divider);
  await expect(search.locator(":scope > svg")).toHaveCSS("opacity", "0.65");
  await expect(page.locator(".altertable-combobox-popover")).toHaveCSS("overflow", "hidden");
});

test("menu search aligns labels and Escape blurs empty searches", async ({ page }) => {
  await page.goto("/gallery");
  const tableSearch = page.getByRole("searchbox", { name: "Search table records" });
  await tableSearch.focus();
  await tableSearch.press("Escape");
  await expect(tableSearch).not.toBeFocused();
  await page.getByRole("button", { name: "Resettable category: HTTP", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Resettable category options" });
  const search = dialog.getByRole("searchbox");
  await search.fill("HTTP");
  const inputBox = await search.boundingBox();
  const labelBox = await dialog.locator(".altertable-combobox-option-content").boundingBox();
  expect(Math.abs(inputBox!.x - labelBox!.x)).toBeLessThanOrEqual(1);
  await search.fill("");
  await search.press("Escape");
  await expect(search).not.toBeFocused();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
