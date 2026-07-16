import type { OutputSink } from "@/lib/runtime.ts";
import { CliError } from "@/lib/errors.ts";
import {
  defaultDisplayOptions,
  formatQueryCellRaw,
  getQueryColumnNames,
  renderQueryHumanOutput,
  renderQueryMarkdown,
  type QueryDisplayOptions,
} from "@/lib/query-format.ts";
import { resolvePagerOptions, writePagedOutput, type PagerOptions } from "@/lib/pager.ts";

export type QueryResultFormat = "human" | "json" | "csv" | "markdown";

const QUERY_RESULT_FORMATS = new Set<QueryResultFormat>(["human", "json", "csv", "markdown"]);

export function parseQueryResultFormat(format: string): QueryResultFormat {
  if (!QUERY_RESULT_FORMATS.has(format as QueryResultFormat)) {
    throw new CliError(`Unsupported format: ${format}. Use human, json, csv, or markdown.`);
  }
  return format as QueryResultFormat;
}

export function csvEscapeCell(value: unknown): string {
  const text = formatQueryCellRaw(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function renderQueryCsv(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
): string {
  const columnNames = getQueryColumnNames(result);
  const lines: string[] = [];

  if (columnNames.length > 0) {
    lines.push(columnNames.map(csvEscapeCell).join(","));
  }

  for (const row of result.rows) {
    if (Array.isArray(row)) {
      lines.push(row.map(csvEscapeCell).join(","));
    } else {
      lines.push(columnNames.map((name) => csvEscapeCell(row[name])).join(","));
    }
  }

  return lines.join("\n");
}

export function renderQueryJson(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
): string {
  return JSON.stringify(result, null, 2);
}

export function renderQueryOutputText(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
  format: QueryResultFormat,
  displayOptions?: QueryDisplayOptions,
): string {
  if (format === "json") {
    return renderQueryJson(result);
  }
  if (format === "csv") {
    return renderQueryCsv(result);
  }
  if (format === "markdown") {
    const columnNames = getQueryColumnNames(result);
    return renderQueryMarkdown(result, columnNames, displayOptions ?? defaultDisplayOptions());
  }
  return renderQueryHumanOutput(result, displayOptions ?? defaultDisplayOptions());
}

export async function writeQueryOutput(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
  format: QueryResultFormat,
  sink: OutputSink,
  displayOptions?: QueryDisplayOptions,
  pagerOptions?: PagerOptions,
): Promise<void> {
  const outputText = renderQueryOutputText(result, sink.json ? "json" : format, displayOptions);
  const usePager = format === "human" && !sink.json;

  if (usePager) {
    await writePagedOutput(outputText, pagerOptions ?? resolvePagerOptions(), sink);
    return;
  }

  if (format === "json" || sink.json) {
    sink.writeJson(JSON.parse(outputText));
    return;
  }

  sink.writeHuman(outputText);
}
