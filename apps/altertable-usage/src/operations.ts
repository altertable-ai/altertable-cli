import {
  defineOperation,
  parseCount,
  parseEmptyInput,
  parseLabel,
  rowsAsRecords,
} from "@altertable/data-app-runtime/contract";

export type Feature = { event: string; events: number; people: number };
export type Usage = { events: number; people: number; organizations: number; features: Feature[] };

const source = "product_analytics.analytics.events";
const eventNames = [
  "Insight Viewed",
  "Ask Agent Completed",
  "Query Run Submitted",
  "Ask Agent Message Sent",
  "Dashboard Viewed",
  "Insight Created",
  "Catalog Created",
  "Dashboard Created",
];
const where = `timestamp >= TIMESTAMP '2026-08-29 00:00:00'
  AND timestamp < TIMESTAMP '2026-09-29 00:00:00'
  AND event IN (${eventNames.map((name) => `'${name}'`).join(", ")})
  AND json_extract_string(properties, '$.organization_slug') <> 'altertable'`;

function parseUsage(value: unknown): Usage {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid usage result.");
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.features)) throw new Error("Invalid feature result.");
  return {
    events: parseCount(result.events),
    people: parseCount(result.people),
    organizations: parseCount(result.organizations),
    features: result.features.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Invalid feature row.");
      const row = item as Record<string, unknown>;
      const event = parseLabel(row.event);
      if (!eventNames.includes(event)) throw new Error("Unexpected feature event.");
      return { event, events: parseCount(row.events), people: parseCount(row.people) };
    }),
  };
}

export const operations = {
  usage: defineOperation({
    input: parseEmptyInput,
    output: parseUsage,
    policy: { maxQueryRows: 10, maxDurationMs: 20_000, exposeSql: true },
    async run({ lakehouse, signal }): Promise<Usage> {
      const summary = await lakehouse.queryAll(
        `SELECT count(*) AS events, count(DISTINCT identity_uuid) AS people,
           count(DISTINCT json_extract_string(properties, '$.organization_slug')) AS organizations
         FROM ${source} WHERE ${where}`,
        { limit: 1, signal, name: "usage-summary" },
      );
      const features = await lakehouse.queryAll(
        `SELECT event, count(*) AS events, count(DISTINCT identity_uuid) AS people
         FROM ${source} WHERE ${where} GROUP BY event ORDER BY events DESC`,
        { limit: 8, signal, name: "usage-by-feature" },
      );
      const [totals] = rowsAsRecords(summary, ["events", "people", "organizations"]);
      if (!totals) throw new Error("Usage summary is missing.");
      return parseUsage({
        ...totals,
        features: rowsAsRecords(features, ["event", "events", "people"]),
      });
    },
  }),
};
