import { defineDataApp } from "@altertable/data-app";
import { defineDateRangeContract } from "@altertable/data-app/contract";

type Activity = { count: number; features: string[] };
export const app = defineDataApp({
  title: "Usage exploration",
  description: "Explore product activity in the selected reporting period.",
  scope: { organization: "Acme", environment: "production" },
  appearance: { theme: "light" },
  queries: {
    activity: {
      statement: "SELECT 120 AS count, 'Queries' AS feature WHERE $start <= $end",
      params: { start: { type: "string" }, end: { type: "string" } },
      projections: { count: { type: "number" }, feature: { type: "string" } },
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
    async run({ query }, input): Promise<Activity> {
      const result = await query(
        "activity",
        { start: input.range.start, end: input.range.end },
        { limit: 10 },
      );
      const firstRow = result.rows[0];
      if (!firstRow) throw new Error("Activity query returned no rows.");
      return {
        count: firstRow.count,
        features: result.rows.map((row) => row.feature),
      };
    },
  }),
};
