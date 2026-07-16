import { CliError } from "@/lib/errors.ts";
import { renderQueryCsv, renderQueryJson } from "@/lib/query-output.ts";
import {
  defaultDisplayOptions,
  getQueryColumnNames,
  renderQueryHumanOutput,
  renderQueryMarkdown,
} from "@/lib/query-format.ts";

export type ManagementOutputFormat = "json" | "table" | "csv" | "markdown";

const MANAGEMENT_OUTPUT_FORMATS = new Set<ManagementOutputFormat>([
  "json",
  "table",
  "csv",
  "markdown",
]);

export type TabularResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export function parseManagementOutputFormat(format: string): ManagementOutputFormat {
  if (!MANAGEMENT_OUTPUT_FORMATS.has(format as ManagementOutputFormat)) {
    throw new CliError(`Unsupported format: ${format}. Use json, table, csv, or markdown.`);
  }
  return format as ManagementOutputFormat;
}

export function renderTabularOutput(result: TabularResult, format: ManagementOutputFormat): string {
  const queryResult = { metadata: {}, columns: result.columns, rows: result.rows };
  if (format === "json") return renderQueryJson(queryResult);
  if (format === "csv") return renderQueryCsv(queryResult);
  if (format === "markdown") {
    return renderQueryMarkdown(
      queryResult,
      getQueryColumnNames(queryResult),
      defaultDisplayOptions(),
    );
  }
  return renderQueryHumanOutput(queryResult, { ...defaultDisplayOptions(), layout: "table" });
}
