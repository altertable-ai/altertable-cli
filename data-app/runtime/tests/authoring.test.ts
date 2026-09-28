import { expect, test } from "bun:test";
import {
  connectionCheck,
  parseCount,
  parseDateRangeInput,
  parseEmptyInput,
  parseLabel,
  parseTrue,
  rowsAsRecords,
} from "../src/contract.ts";
import { dataAppTitle } from "../src/config.ts";
import { resolveDataView } from "../src/ui/requests/DataBoundary.tsx";

test("starter connection requires a successful bounded query", async () => {
  const query = connectionCheck();
  const calls: unknown[] = [];
  const result = await query.run(
    {
      signal: new AbortController().signal,
      lakehouse: {
        async queryAll(statement, options) {
          calls.push({ statement, limit: options.limit, name: options.name });
          return { columns: [{ name: "connection_check" }], rows: [[1]] };
        },
      },
    },
    query.input({}),
  );
  expect(result).toBe(true);
  expect(calls).toEqual([
    { statement: "SELECT 1 AS connection_check", limit: 1, name: "connection-check" },
  ]);
  expect(query.output(true)).toBe(true);
  expect(() => parseTrue(false)).toThrow();
  expect(() => parseEmptyInput({ extra: true })).toThrow();
  expect(() => parseEmptyInput([])).toThrow();
  expect(
    query.run(
      {
        signal: new AbortController().signal,
        lakehouse: {
          async queryAll() {
            throw new Error("No lakehouse access");
          },
        },
      },
      {},
    ),
  ).rejects.toThrow("No lakehouse access");
});

test("server parsers reject invalid dates, counts, and query shapes", () => {
  const bounded = { minDate: "2026-01-01", maxDate: "2026-01-31", maxRangeDays: 7 };
  expect(parseDateRangeInput({ start: "2026-01-02", end: "2026-01-08" }, bounded)).toEqual({
    start: "2026-01-02",
    end: "2026-01-08",
  });
  for (const range of [
    { start: "2026-02-30", end: "2026-02-30" },
    { start: "2026-01-08", end: "2026-01-02" },
    { start: "2026-01-01", end: "2026-01-08" },
    { start: "2025-12-31", end: "2026-01-02" },
  ]) {
    expect(() => parseDateRangeInput(range, bounded)).toThrow();
  }
  expect(parseCount("12")).toBe(12);
  for (const value of [-1, 1.5, "not-a-number", Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => parseCount(value)).toThrow();
  }
  expect(parseLabel("Catalog")).toBe("Catalog");
  expect(() => parseLabel("", 20)).toThrow();
  expect(
    rowsAsRecords({ columns: [{ name: "name" }, { name: "count" }], rows: [["A", 2]] }, ["count"]),
  ).toEqual([{ name: "A", count: 2 }]);
  expect(() => rowsAsRecords({ columns: [{ name: "name" }], rows: [["A"]] }, ["count"])).toThrow();
  expect(() =>
    rowsAsRecords({ columns: [{ name: "name" }], rows: [["A", 2]] }, ["name"]),
  ).toThrow();
});

test("document title reflects the app's configured scope", () => {
  expect(
    dataAppTitle({ title: "Revenue", scope: { organization: "Acme", environment: "production" } }),
  ).toBe("Revenue • Acme/production • Altertable app");
});

test("request state labels data from an older input and preserves it on failure", () => {
  const options = {
    requestedInput: { start: "2026-02-01" },
    previous: { input: { start: "2026-01-01" }, data: { count: 12 } },
    pending: true,
    sameInput: (left: { start: string }, right: { start: string }) => left.start === right.start,
    describe: (input: { start: string }) => input.start,
    isEmpty: () => false,
  };
  expect(resolveDataView(options)).toMatchObject({
    kind: "updating",
    displayedInput: { start: "2026-01-01" },
    requestedInput: { start: "2026-02-01" },
  });
  expect(
    resolveDataView({ ...options, pending: false, error: new Error("unavailable") }),
  ).toMatchObject({
    kind: "stale-error",
    data: { count: 12 },
  });
});
