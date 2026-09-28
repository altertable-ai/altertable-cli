import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { searchItems } from "../src/ui/controls/searchItems.ts";
import { SearchMatch } from "../src/ui/controls/SearchMatch.tsx";
import { ariaKeyShortcuts, shortcutLabel } from "../src/ui/controls/shortcuts.ts";
import { TableCard } from "../src/ui/cards/TableCard.tsx";
import {
  dateRangeControl,
  dateRangeVariable,
  defineAppVariables,
  selectVariable,
  textVariable,
} from "../src/ui/controls/variables.ts";
import { createDataClient, DataAppError } from "../src/client.ts";
import { createDataHandler } from "../src/server.ts";

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
    }),
  );
  expect(table).toContain("<mark>Café</mark> &lt;table&gt;");
  expect(table).toContain('class="altertable-data-panel-count">1</span>');
  expect(table).toMatch(/<th[^>]*data-type="number"[^>]*>Count<\/th>/);
  expect(table).toMatch(/<td[^>]*data-type="number"[^>]*>12<\/td>/);
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
  const period = dateRangeVariable({
    key: "period",
    minDate: "2020-01-01",
    maxDate: () => sourceEnd,
    maxRangeDays: 7,
    timeZone: "UTC",
    defaultValue: { kind: "preset", id: "last-3" },
  });
  const selection = period.read(new URLSearchParams("period=last-3"));
  expect(period.resolve(selection)).toEqual({ start: "2020-01-05", end: "2020-01-07" });
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

test("operation routes decode one path segment and client errors remain useful", async () => {
  const operation = {
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
