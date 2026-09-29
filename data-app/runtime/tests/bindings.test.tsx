import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { defineDateRangeContract, defineOperation, defineQueryNames } from "../src/contract.ts";
import { createDataClient } from "../src/client.ts";
import { createDataHooks } from "../src/react.tsx";
import { resolveViewInput } from "../src/view.tsx";
import { dateRangeVariable } from "../src/ui/variables.ts";
import { createDataContext } from "../src/ui/data-context.ts";
import { ComparisonVisual } from "../src/ui/ComparisonVisual.tsx";
import { VisualizationCard } from "../src/ui/VisualizationCard.tsx";
import { TableCard } from "../src/ui/TableCard.tsx";
import { CardViewTabs } from "../src/ui/CardViewTabs.tsx";
import type { DataOperation, DateRangeRequest } from "../src/contract.ts";

const names = defineQueryNames({ activity: "activity" });
const context = createDataContext(names)({
  description: "Activity",
  glossary: {
    actions: { term: "Actions", definition: "Recorded actions", queryNames: [names.activity] },
  },
});
const actions = context.metric({ id: "actions", glossaryId: "actions", format: { kind: "count" } });
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
const { defineDataView } = createDataHooks<{ activity: DataOperation<DateRangeRequest, Data> }>(
  createDataClient(),
);
const view = defineDataView({
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  date: { variable: "period", input: (input) => input },
  isEmpty: (data) => data.rows.length === 0,
  empty: { title: "No actions" },
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

test("bound visual selectors do not run during loading or render an empty result", () => {
  let calls = 0;
  const content = view.content((result) => (
    <VisualizationCard
      title="Features"
      reading={result.select((data) => {
        calls++;
        return data.rows;
      })}
      isEmpty={(rows) => rows.length === 0}
      empty={{ title: "No features" }}
      skeleton={{ variant: "ranking", rows: 6 }}
    >
      {(rows) => <p>{rows.join(", ")}</p>}
    </VisualizationCard>
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

test("card tabs reject duplicate and unknown IDs instead of producing a blank panel", () => {
  const tab = {
    id: "actions",
    label: "Actions",
    content: "Ready",
    isEmpty: false,
    empty: { title: "Empty" },
  };
  expect(() =>
    renderToStaticMarkup(
      <CardViewTabs
        label="Views"
        views={[tab, tab]}
        selectedKey="actions"
        onSelectionChange={() => {}}
      />,
    ),
  ).toThrow("unique");
  expect(() =>
    renderToStaticMarkup(
      <CardViewTabs
        label="Views"
        views={[tab]}
        selectedKey="missing"
        onSelectionChange={() => {}}
      />,
    ),
  ).toThrow("Unknown card tab");
});

test("bound visualization views render inside one card with a selected view", () => {
  const html = renderToStaticMarkup(
    <VisualizationCard
      title="Feature use"
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
    <TableCard
      title="Features"
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
