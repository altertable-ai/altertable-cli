import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defineDateRangeContract,
  defineOperation,
  defineQueryNames,
} from "../src/core/contract.ts";
import { createDataClient } from "../src/client/index.ts";
import { createDataHooks } from "../src/react/index.ts";
import { displayedSnapshot } from "../src/core/data-view.ts";
import { storySteps } from "../src/react/ui/story.ts";
import { resolveViewInput } from "../src/react/view.ts";
import { dateRangeVariable } from "../src/react/ui/variables.ts";
import { createDataContext } from "../src/react/ui/data-context.ts";
import { ComparisonVisual } from "../src/react/ui/ComparisonVisual.tsx";
import { VisualizationWidget } from "../src/react/ui/VisualizationWidget.tsx";
import { TableWidget } from "../src/react/ui/TableWidget.tsx";
import { WidgetViewTabs } from "../src/react/ui/WidgetViewTabs.tsx";
import type { DataOperation, DateRangeRequest } from "../src/core/contract.ts";

const names = defineQueryNames({ activity: "activity" });
const context = createDataContext(names)({
  description: "Activity",
  glossary: {
    actions: { term: "Actions", definition: "Recorded actions", queryNames: [names.activity] },
  },
});
const actions = context.metric({ id: "actions", glossaryId: "actions", format: { kind: "count" } });
const featureEvidence = context.evidence({ id: "features", queryNames: [names.activity] });
const calendar = defineDateRangeContract({
  timeZone: "UTC",
  maxRangeDays: 31,
  minDate: "2026-01-01",
  maxDate: "2026-03-31",
});
const period = dateRangeVariable({
  key: "period",
  contract: calendar,
  comparison: true,
  defaultValue: { kind: "preset", id: "last-7" },
});
type Data = { current: number; previous: number | null; rows: string[] };
const { defineDataView, defineTimeView } = createDataHooks<{
  activity: DataOperation<DateRangeRequest, Data>;
}>(createDataClient());
const view = defineDataView({
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  date: { variable: "period", input: (input) => input },
  isEmpty: (data) => data.rows.length === 0,
  empty: { title: "No actions" },
});

test("time view derives its control, input, and displayed period from one declaration", () => {
  const timed = defineTimeView({
    operation: "activity",
    time: { contract: calendar, defaultValue: { kind: "preset", id: "last-7" } },
    isEmpty: (data) => !data.rows.length,
    empty: { title: "No actions" },
  });
  const input = calendar.request({ start: "2026-03-10", end: "2026-03-12" });
  expect(timed.variables.period.kind).toBe("dateRange");
  expect(resolveViewInput(timed, { period: input })).toEqual(input);
  expect(timed.describeInput(input)).toContain("Mar 10–12, 2026");
});

test("Present findings use the displayed input and require unique, supported evidence", () => {
  const data = { current: 12, previous: null, rows: ["a"] };
  const view = {
    kind: "stale-error" as const,
    data,
    displayedInput: "old",
    requestedInput: "new",
    error: new Error("offline"),
    message: "stale",
  };
  expect(displayedSnapshot(view)).toEqual({ data, input: "old", state: "stale-error" });
  const finding = {
    id: "concentration",
    headline: "Most activity occurred on one day",
    visual: "12 actions",
    evidence: featureEvidence,
  };
  expect(storySteps([finding], context)[0]?.queryNames).toEqual(["activity"]);
  expect(() => storySteps([finding, finding], context)).toThrow("unique");
  expect(() =>
    storySteps([{ ...finding, evidence: { id: "missing", queryNames: ["unknown"] } }], context),
  ).toThrow("Unknown query");
});

test("bound metrics share values, formatting, evidence and displayed comparison periods", () => {
  expect(actions.evidence).toEqual({
    id: "actions",
    glossaryIds: ["actions"],
    queryNames: ["activity"],
  });
  const content = view.content((result) => {
    const reading = result.metric((data) => ({ current: data.current, previous: data.previous }));
    return <ComparisonVisual metric={actions} reading={reading} />;
  });
  const input = calendar.request({ start: "2026-03-10", end: "2026-03-12" }, true);
  const html = renderToStaticMarkup(
    content.children({ current: 120, previous: 100, rows: ["a"] }, input),
  );
  expect(html).toContain("120");
  expect(html).toContain("20.0%");
  expect(html).toContain("Mar 10–12, 2026");
  expect(html).toContain("Mar 7–9, 2026");
  expect(
    renderToStaticMarkup(content.children({ current: 0, previous: null, rows: [] }, input)),
  ).toContain("No comparable previous value");
  expect(
    renderToStaticMarkup(content.children({ current: 120, previous: 0, rows: [] }, input)),
  ).not.toContain("Infinity");
});

test("favorable direction colors a comparison without changing its numeric direction", () => {
  const fewerIsBetter = context.metric({
    id: "errors",
    glossaryId: "actions",
    format: { kind: "count" },
    favorableDirection: "down",
  });
  const content = view.content((result) => (
    <ComparisonVisual
      metric={fewerIsBetter}
      reading={result.metric((data) => ({ current: data.current, previous: data.previous }))}
    />
  ));
  const input = calendar.request({ start: "2026-03-10", end: "2026-03-12" }, true);
  const html = renderToStaticMarkup(
    content.children({ current: 120, previous: 100, rows: ["a"] }, input),
  );
  expect(html).toContain('data-tone="bad"');
  expect(html).toContain("20.0%");
});

test("bound visual selectors do not run during loading or render an empty result", () => {
  let calls = 0;
  const content = view.content((result) => (
    <VisualizationWidget
      title="Features"
      evidence={featureEvidence}
      reading={result.select((data) => {
        calls++;
        return data.rows;
      })}
      isEmpty={(rows) => rows.length === 0}
      empty={{ title: "No features" }}
      skeleton={{ variant: "ranking", rows: 6 }}
    >
      {(rows) => <p>{rows.join(", ")}</p>}
    </VisualizationWidget>
  ));
  expect(calls).toBe(0);
  expect(
    renderToStaticMarkup(content.loading).match(/class="altertable-content-skeleton-row"/g),
  ).toHaveLength(6);
  const input = calendar.request({ start: "2026-03-10", end: "2026-03-12" });
  expect(
    renderToStaticMarkup(content.children({ current: 0, previous: null, rows: [] }, input)),
  ).toContain("No features");
  expect(calls).toBe(1);
});

test("date bindings reject silently changed ranges and comparisons", () => {
  const selection = calendar.request({ start: "2026-03-10", end: "2026-03-12" }, true);
  expect(resolveViewInput(view, { period: selection })).toEqual(selection);
  expect(() =>
    resolveViewInput(
      { ...view, input: ({ period }) => ({ ...period, comparison: null }) },
      { period: selection },
    ),
  ).toThrow("preserve");
});

test("operation query runner supplies registered identity, policy limit and cancellation", async () => {
  const operation = defineOperation({
    input: () => ({}),
    output: () => true,
    checks: [{}],
    queryNames: names,
    policy: { maxQueryRows: 12, maxDurationMs: 1000 },
    async run({ query }) {
      await query(names.activity, "SELECT 1");
      return true;
    },
  });
  const signal = new AbortController().signal;
  let captured: unknown;
  await operation.run(
    {
      signal,
      lakehouse: {
        async queryAll(statement, options) {
          captured = { statement, ...options };
          return { columns: [], rows: [] };
        },
      },
    },
    {},
  );
  expect(captured).toEqual({ statement: "SELECT 1", name: "activity", limit: 12, signal });
});

test("widget tabs reject duplicate and unknown IDs instead of producing a blank panel", () => {
  const tab = {
    id: "actions",
    label: "Actions",
    content: "Ready",
    isEmpty: false,
    empty: { title: "Empty" },
  };
  expect(() =>
    renderToStaticMarkup(
      <WidgetViewTabs
        label="Views"
        views={[tab, tab]}
        selectedKey="actions"
        onSelectionChange={() => {}}
      />,
    ),
  ).toThrow("unique");
  expect(() =>
    renderToStaticMarkup(
      <WidgetViewTabs
        label="Views"
        views={[tab]}
        selectedKey="missing"
        onSelectionChange={() => {}}
      />,
    ),
  ).toThrow("Unknown widget tab");
});

test("bound visualization views render inside one widget with a selected view", () => {
  const html = renderToStaticMarkup(
    <VisualizationWidget
      title="Feature use"
      evidence={featureEvidence}
      reading={{ loading: false, value: [{ name: "Insights", count: 4 }] }}
      isEmpty={(rows) => rows.length === 0}
      empty={{ title: "No feature use" }}
      viewLabel="Measure"
      views={[
        {
          id: "actions",
          label: "Actions",
          render: (rows) => <span>{rows[0]?.count} actions</span>,
        },
        { id: "reach", label: "Reach", render: (rows) => <span>{rows[0]?.name}</span> },
      ]}
    />,
  );
  expect(html).toContain("Feature use");
  expect(html).toContain("Actions");
  expect(html).toContain("Reach");
  expect(html).toContain("4 actions");
});

test("bound tables keep their row contract while loading", () => {
  const content = view.content((result) => (
    <TableWidget
      title="Features"
      evidence={featureEvidence}
      reading={result.select((data) => data.rows)}
      rowKey={(row) => row}
      columns={[{ id: "feature", header: "Feature", cell: (row) => row }]}
      empty={{ title: "No features" }}
      skeletonRows={3}
    />
  ));
  expect(
    renderToStaticMarkup(content.loading).match(/class="altertable-content-skeleton-row"/g),
  ).toHaveLength(3);
  const input = calendar.request({ start: "2026-03-10", end: "2026-03-12" });
  expect(
    renderToStaticMarkup(
      content.children({ current: 1, previous: null, rows: ["Insights"] }, input),
    ),
  ).toContain("Insights");
  expect(
    renderToStaticMarkup(content.children({ current: 0, previous: null, rows: [] }, input)),
  ).toContain("No features");
});
