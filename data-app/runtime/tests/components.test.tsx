import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { searchItems } from "../src/react/ui/searchItems.ts";
import { SearchMatch } from "../src/react/ui/SearchMatch.tsx";
import { ariaKeyShortcuts, shortcutLabel } from "../src/react/ui/shortcuts.ts";
import { Combobox } from "../src/react/ui/Combobox.tsx";
import { VisualizationWidget } from "../src/react/ui/VisualizationWidget.tsx";
import { TableWidget } from "../src/react/ui/TableWidget.tsx";
import { QueryList, formatSql } from "../src/react/ui/QueryList.tsx";
import { DataSection } from "../src/react/ui/DataSection.tsx";
import {
  dateRangeControl,
  dateRangeVariable,
  defineAppVariables,
  selectVariable,
  textVariable,
} from "../src/react/ui/variables.ts";
import { createDataClient, DataAppError } from "../src/client/index.ts";
import { createDataHandler } from "../src/server/index.ts";
import { defineDateRangeContract, defineQueryNames } from "../src/core/contract.ts";
import { chartColor } from "../src/react/ui/chartColor.ts";
import { formatMetric } from "../src/core/format.ts";

test("initial data errors show a useful recovery action for each failure", () => {
  function render(code: string) {
    return renderToStaticMarkup(
      <DataSection
        empty={{ title: "No results" }}
        result={{
          view: { kind: "error" as const, error: new DataAppError("Raw server text", code) },
          refetch: () => {},
        }}
      >
        {() => null}
      </DataSection>,
    );
  }
  const unavailable = render("source_unavailable");
  expect(unavailable).toContain("Couldn’t load results");
  expect(unavailable).toContain("The lakehouse isn’t responding.");
  expect(unavailable).toContain("Retry</button>");
  expect(unavailable).not.toContain("Raw server text");
  const forbidden = render("source_forbidden");
  expect(forbidden).toContain("Data access denied");
  expect(forbidden).not.toContain("Retry</button>");
  const query = render("source_query_rejected");
  expect(query).toContain("Ask the app owner to check the data operation.");
  expect(query).not.toContain("Retry</button>");
});

test("local search preserves table order and highlights original text", () => {
  const rows = [
    { id: "first", name: "Café <table>", catalog: "prod" },
    { id: "second", name: "Cafe", catalog: "stage" },
  ];
  const attributes = [
    { name: "name", getter: (row: (typeof rows)[number]) => row.name },
    { name: "catalog", getter: (row: (typeof rows)[number]) => row.catalog },
  ] as const;
  const hits = searchItems(rows, "cafe prod", { attributes });
  expect(hits).toEqual([
    {
      item: rows[0],
      score: 0,
      matches: {
        name: { text: rows[0]!.name, ranges: [{ start: 0, end: 4 }] },
        catalog: { text: "prod", ranges: [{ start: 0, end: 4 }] },
      },
    },
  ]);
  expect(searchItems(rows, "", { attributes }).map((hit) => hit.item.id)).toEqual([
    "first",
    "second",
  ]);
  expect(searchItems(rows, "cafe", { attributes, mode: "fuzzy" })).toHaveLength(2);
  expect(
    renderToStaticMarkup(
      createElement(SearchMatch, {
        match: hits[0]!.matches.name,
      }),
    ),
  ).toContain("<mark>Café</mark> &lt;table&gt;");
  const table = renderToStaticMarkup(
    createElement(TableWidget<(typeof hits)[number]>, {
      title: "Results",
      count: hits.length,
      columns: [
        {
          id: "name",
          header: "Name",
          cell: (hit: (typeof hits)[number]) =>
            createElement(SearchMatch, { match: hit.matches.name }),
        },
        { id: "count", header: "Count", type: "number", cell: () => "12" },
      ],
      rows: hits,
      rowKey: (hit: (typeof hits)[number]) => hit.item.id,
      empty: { title: "No matching rows" },
    }),
  );
  expect(table).toContain("<mark>Café</mark> &lt;table&gt;");
  expect(table).toContain('class="altertable-data-widget-count">1</span>');
  expect(table).toMatch(/<th[^>]*data-type="number"[^>]*>Count<\/th>/);
  expect(table).toMatch(/<td[^>]*data-type="number"[^>]*>12<\/td>/);
});

test("table search finds a later matching row before applying the display limit", () => {
  const rows = [
    { id: "first", name: "Alpha" },
    { id: "last", name: "Café" },
  ];
  const table = renderToStaticMarkup(
    createElement(TableWidget<(typeof rows)[number]>, {
      title: "Customers",
      columns: [{ id: "name", header: "Name", cell: (row) => row.name }],
      rows,
      rowKey: (row) => row.id,
      limit: 1,
      search: {
        value: "cafe",
        onChange: () => {},
        label: "Search customers",
        attributes: [{ name: "name", getter: (row) => row.name }],
      },
      empty: { title: "No matching customers" },
    }),
  );
  expect(table).toContain("Café");
  expect(table).not.toContain("Alpha");
});

test("query notebook groups disclosed SQL and exposes one copy-all action", () => {
  const html = renderToStaticMarkup(
    <QueryList
      expanded
      queries={[
        { name: "totals", statement: "select count(*) from orders" },
        { name: "details", statement: "select id from orders" },
      ]}
    />,
  );
  expect(html).toContain('aria-label="Query notebook"');
  expect(html).toContain('aria-label="Copy all"');
  expect(html).toContain("totals.sql");
  expect(html).toContain("details.sql");
});

test("read-only SQL keeps literals and query whitespace intact", () => {
  expect(formatSql("  SELECT 'FROM orders' AS label\n  FROM orders  ")).toBe(
    "SELECT 'FROM orders' AS label\n  FROM orders",
  );
});

test("category color follows identity and numeric metric formats use their units", () => {
  expect(chartColor("insights")).toBe(chartColor("insights"));
  expect(formatMetric(0.125, { kind: "ratio" })).toBe("12.5%");
  expect(formatMetric(12, { kind: "count" })).toBe("12");
  expect(formatMetric(12, { kind: "currency", currency: "USD" })).toBe("$12.00");
});

test("named query registry rejects ambiguous evidence names", () => {
  expect(defineQueryNames({ totals: "order-totals" }).totals).toBe("order-totals");
  expect(() => defineQueryNames({ first: "same", second: "same" })).toThrow("unique");
});

test("shortcut labels and accessible keys include optional Shift", () => {
  const shortcut = { modifier: "alt", shift: true, code: "KeyK", key: "K" } as const;
  expect(["⌥⇧K", "Alt+Shift+K"]).toContain(shortcutLabel(shortcut));
  expect(ariaKeyShortcuts(shortcut)).toBe("Alt+Shift+K");
});

test("app variables validate URLs and keep date presets relative", () => {
  const definitions = defineAppVariables({
    search: textVariable({ key: "q" }),
    member: selectVariable({ key: "member", defaultValue: "all", values: ["all", "alice"] }),
  });
  expect(definitions.search.read(new URLSearchParams("q=build"))).toBe("build");
  expect(definitions.search.write("")).toEqual({ q: null });
  expect(definitions.member.read(new URLSearchParams("member=unknown"))).toBe("all");
  expect(() =>
    defineAppVariables({ first: textVariable({ key: "q" }), second: textVariable({ key: "q" }) }),
  ).toThrow("duplicate URL key");

  let sourceEnd = "2020-01-07";
  const contract = defineDateRangeContract({
    minDate: "2020-01-01",
    maxDate: () => sourceEnd,
    maxRangeDays: 7,
    timeZone: "UTC",
  });
  const period = dateRangeVariable({
    key: "period",
    contract,
    defaultValue: { kind: "preset", id: "last-3" },
  });
  const selection = period.read(new URLSearchParams("period=last-3"));
  expect(period.resolve(selection)).toEqual({ start: "2020-01-05", end: "2020-01-07" });
  expect(contract.parse(period.resolve(selection))).toEqual(period.resolve(selection));
  expect(contract.period(period.resolve(selection))).toEqual({
    kind: "calendar",
    start: "2020-01-05",
    end: "2020-01-07",
    timeZone: "UTC",
  });
  expect(period.write(selection)).toEqual({ period: null, start: null, end: null });
  sourceEnd = "2020-01-08";
  expect(period.resolve(selection)).toEqual({ start: "2020-01-06", end: "2020-01-08" });
  expect(period.read(new URLSearchParams("start=2020-01-06&end=2020-01-08"))).toEqual({
    kind: "dates",
    start: "2020-01-06",
    end: "2020-01-08",
  });
  expect(period.read(new URLSearchParams("period=last-90"))).toEqual(period.defaultValue);
  expect(dateRangeControl(period, selection, () => {}).value).toEqual({
    start: "2020-01-06",
    end: "2020-01-08",
  });
});

test("date comparison is opt-in, URL-backed, and bounded by source coverage", () => {
  const period = dateRangeVariable({
    key: "period",
    comparison: true,
    contract: defineDateRangeContract({
      minDate: "2026-03-01",
      maxDate: "2026-03-31",
      maxRangeDays: 31,
      timeZone: "UTC",
    }),
    defaultValue: { kind: "dates", start: "2026-03-10", end: "2026-03-12" },
  });
  const selected = period.read(
    new URLSearchParams("start=2026-03-10&end=2026-03-12&compare=previous"),
  );
  expect(selected).toEqual({
    kind: "dates",
    start: "2026-03-10",
    end: "2026-03-12",
    comparison: "previous",
  });
  expect(period.previous(selected)).toEqual({ start: "2026-03-07", end: "2026-03-09" });
  expect(period.comparisonRange(selected)).toEqual({ start: "2026-03-07", end: "2026-03-09" });
  expect(period.comparisonRange(period.defaultValue)).toBeNull();
  expect(period.write(selected)).toEqual({
    period: null,
    start: "2026-03-10",
    end: "2026-03-12",
    compare: "previous",
  });
  expect(
    period.read(new URLSearchParams("start=2026-03-01&end=2026-03-03&compare=previous")),
  ).toEqual({
    kind: "dates",
    start: "2026-03-01",
    end: "2026-03-03",
  });
  const changes: unknown[] = [];
  const control = dateRangeControl(period, selected, (next) => changes.push(next));
  expect(control.comparison?.range).toEqual({ start: "2026-03-07", end: "2026-03-09" });
  control.onChange({ start: "2026-03-01", end: "2026-03-03" });
  expect(changes).toEqual([{ kind: "dates", start: "2026-03-01", end: "2026-03-03" }]);
});

test("operation routes decode one path segment and client errors remain useful", async () => {
  const operation = {
    checks: [{}],
    input: (value: unknown) => value,
    output: (value: unknown) => value,
    run: async () => ({ count: 1 }),
    policy: { maxQueryRows: 1, maxDurationMs: 1000 },
  };
  const handler = createDataHandler({ "usage / team": operation }, async () => ({
    lakehouse: { queryAll: async () => ({ columns: [], rows: [] }) },
    canDiscloseSql: false,
  }));
  const response = await handler(
    new Request("http://localhost/api/data/usage%20%2F%20team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({ count: 1 });
  const client = createDataClient({
    fetch: (async () =>
      new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof fetch,
  });
  expect(client.query("usage", {})).rejects.toMatchObject({
    name: "DataAppError",
    code: "request_failed",
    message: "Could not load data.",
  });
  expect(DataAppError.name).toBe("DataAppError");
});

test("table pagination defaults to a bottom footer and supports complete and preview tables", () => {
  const rows = Array.from({ length: 12 }, (_, id) => ({ id, name: `Item ${id + 1}` }));
  const props = {
    title: "Items",
    columns: [
      { id: "name", header: "Name", cell: (row: (typeof rows)[number]) => row.name },
    ] as const,
    rows,
    rowKey: (row: (typeof rows)[number]) => row.id,
    empty: { title: "No items" },
  };
  const paginated = renderToStaticMarkup(<TableWidget {...props} />);
  expect(paginated).toContain("1–10 of 12 results");
  expect(paginated).not.toContain("Item 11");
  expect(paginated).toMatch(
    /<footer class="altertable-data-widget-footer"><nav[^>]*aria-label="Table pages"/,
  );
  expect(paginated.indexOf("</table>")).toBeLessThan(paginated.indexOf('aria-label="Table pages"'));
  const complete = renderToStaticMarkup(<TableWidget {...props} pagination={false} />);
  expect(complete).toContain("Item 12");
  expect(complete).not.toContain('aria-label="Table pages"');
  const preview = renderToStaticMarkup(<TableWidget {...props} limit={2} />);
  expect(preview).not.toContain("Item 3");
  expect(preview).not.toContain('aria-label="Table pages"');
});

test("pickers reject ambiguous selections and require explicit empty-selection meaning", () => {
  const options = [{ id: "a", label: "Alpha" }];
  const render = (props: Parameters<typeof Combobox>[0]) =>
    renderToStaticMarkup(<Combobox {...props} />);
  expect(() =>
    render({ label: "Value", options: [...options, ...options], value: "a", onChange() {} }),
  ).toThrow("unique");
  expect(() => render({ label: "Value", options, value: "unknown", onChange() {} })).toThrow(
    "available option IDs",
  );
  expect(() =>
    render({ label: "Value", options, value: "a", resetValue: "unknown", onChange() {} }),
  ).toThrow("resetValue");
  expect(() =>
    render({
      label: "Value",
      options,
      values: ["a", "a"],
      maxSelected: 2,
      emptySelectionLabel: "All",
      onChange() {},
    }),
  ).toThrow("unique");
  expect(() =>
    render({
      label: "Value",
      options,
      values: [],
      maxSelected: 0,
      emptySelectionLabel: "All",
      onChange() {},
    }),
  ).toThrow("positive integer");
  expect(
    render({
      label: "Value",
      options,
      values: [],
      maxSelected: 1,
      emptySelectionLabel: "Choose a category",
      onChange() {},
    }),
  ).toContain("Value: Choose a category");
  expect(
    render({ label: "Value", options: [], value: "a", loading: true, onChange() {} }),
  ).toContain("Value: a");
});

test("table configurations reject duplicate identities and contradictory display rules", () => {
  const props = {
    title: "Rows",
    columns: [
      { id: "name", header: "Name", cell: (row: { id: string | number }) => row.id },
    ] as const,
    rows: [{ id: 1 }],
    rowKey: (row: { id: string | number }) => row.id,
    empty: { title: "No rows" },
  };
  expect(() =>
    renderToStaticMarkup(<TableWidget {...props} rows={[{ id: 1 }, { id: "1" }]} />),
  ).toThrow("row keys");
  expect(() =>
    renderToStaticMarkup(<TableWidget {...props} columns={[props.columns[0], props.columns[0]]} />),
  ).toThrow("column IDs");
  expect(() => renderToStaticMarkup(<TableWidget {...props} limit={0} />)).toThrow(
    "positive integer",
  );
  expect(() =>
    renderToStaticMarkup(<TableWidget {...props} pagination={{ pageSize: 1.5 }} />),
  ).toThrow("positive integer");
  // JavaScript callers must respect the same exclusivity as TypeScript callers.
  const invalid = { ...props, limit: 1, pagination: { pageSize: 2 } };
  // @ts-expect-error intentional invalid runtime configuration
  expect(() => renderToStaticMarkup(<TableWidget {...invalid} />)).toThrow("mutually exclusive");
});

test("visualization view identities are validated even while data is loading", () => {
  const props = {
    title: "Views",
    reading: { loading: true } as const,
    isEmpty: (rows: string[]) => rows.length === 0,
    empty: { title: "No rows" },
    evidence: { id: "rows", queryNames: ["rows"] as [string] },
    viewLabel: "View",
  };
  const view = { id: "chart", label: "Chart", render: () => null };
  expect(() =>
    renderToStaticMarkup(<VisualizationWidget {...props} views={[view, view]} />),
  ).toThrow("unique");
  expect(() =>
    renderToStaticMarkup(<VisualizationWidget {...props} views={[view]} initialView="missing" />),
  ).toThrow("Unknown widget tab");
});
