import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { searchItems } from "../src/ui/searchItems.ts";
import { SearchMatch } from "../src/ui/SearchMatch.tsx";
import { ariaKeyShortcuts, shortcutLabel } from "../src/ui/shortcuts.ts";
import { TableCard } from "../src/ui/TableCard.tsx";
import { DataSection } from "../src/ui/DataSection.tsx";
import {
  dateRangeControl,
  dateRangeVariable,
  defineAppVariables,
  selectVariable,
  textVariable,
} from "../src/ui/variables.ts";
import { createDataClient, DataAppError } from "../src/client.ts";
import { createDataHandler } from "../src/server.ts";
import { defineDateRangeContract, defineQueryNames } from "../src/contract.ts";
import { chartColor } from "../src/ui/chartColor.ts";
import { formatMetric } from "../src/format.ts";

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
    createElement(TableCard<(typeof hits)[number]>, {
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
  expect(table).toContain('class="altertable-data-panel-count">1</span>');
  expect(table).toMatch(/<th[^>]*data-type="number"[^>]*>Count<\/th>/);
  expect(table).toMatch(/<td[^>]*data-type="number"[^>]*>12<\/td>/);
});

test("table search finds a later matching row before applying the display limit", () => {
  const rows = [
    { id: "first", name: "Alpha" },
    { id: "last", name: "Café" },
  ];
  const table = renderToStaticMarkup(
    createElement(TableCard<(typeof rows)[number]>, {
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
