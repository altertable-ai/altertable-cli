import { defineDataApp } from "@altertable/data-app";
import { defineDateRangeContract, parseCount, parseLabel } from "@altertable/data-app/contract";

type Activity = { count: number; features: string[] };
export const app = defineDataApp({
  title: "Usage exploration",
  description: "Explore product activity in the selected reporting period.",
  scope: { organization: "Acme", environment: "production" },
  appearance: { theme: "light" },
  queries: {
    activity: {
      statement: "SELECT 120 AS count, 'Queries' AS feature WHERE $start <= $end",
      params: { start: {}, end: {} },
    },
  },
});
export const calendar = defineDateRangeContract({
  minDate: "2026-01-01",
  maxDate: "2026-03-31",
  maxRangeDays: 31,
  timeZone: "UTC",
});
export const operations = {
  activity: app.defineOperation({
    policy: { maxQueryRows: 10, maxDurationMs: 30_000, maxResponseBytes: 1_000_000 },
    checks: [{ range: { start: "2026-03-10", end: "2026-03-12" }, comparison: null }],
    input: calendar.parseRequest,
    output(value: unknown): Activity {
      if (!value || typeof value !== "object") throw new Error("Invalid activity result");
      const result = value as { count?: unknown; features?: unknown };
      if (!Array.isArray(result.features)) throw new Error("Invalid activity features");
      return {
        count: parseCount(result.count),
        features: result.features.map((feature) => parseLabel(feature)),
      };
    },
    async run({ query }, input) {
      const result = await query(
        "activity",
        { start: input.range.start, end: input.range.end },
        { limit: 10 },
      );
      return {
        count: parseCount(result.rows[0]?.[0]),
        features: result.rows.map((row) => parseLabel(row[1])),
      };
    },
  }),
};
