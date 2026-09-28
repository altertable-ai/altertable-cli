import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DataSection } from "../src/ui/DataSection.tsx";
import type { DataView } from "../src/ui/DataBoundary.tsx";

type Input = { start: string; end: string };
const displayedInput = { start: "2026-09-01", end: "2026-09-07" };
const requestedInput = { start: "2026-09-08", end: "2026-09-14" };

function render(view: DataView<number, Input>) {
  return renderToStaticMarkup(
    <DataSection
      view={view}
      reportingPeriod={({ start, end }) => ({ kind: "calendar", start, end, timeZone: "UTC" })}
    >
      {(count) => <h2>{count} orders</h2>}
    </DataSection>,
  );
}

test("reporting period follows visible data during updates and failures", () => {
  const ready = render({ kind: "ready", data: 12, input: displayedInput });
  const updating = render({
    kind: "updating",
    data: 12,
    displayedInput,
    requestedInput,
    message: "Updating",
  });
  const stale = render({
    kind: "stale-error",
    data: 12,
    displayedInput,
    requestedInput,
    error: new Error("unavailable"),
    message: "Couldn’t update",
  });
  for (const html of [ready, updating, stale]) {
    expect(html).toContain("2026-09-01 – 2026-09-07 · UTC");
    expect(html).not.toContain("2026-09-08");
  }
});

test("loading reserves the period line without claiming requested dates as results", () => {
  const html = render({ kind: "loading" });
  expect(html).toContain("Reporting period");
  expect(html).not.toContain("2026-09-01");
});
