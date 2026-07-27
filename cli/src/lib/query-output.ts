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
import { writeQueryDestination } from "@/lib/query-destination.ts";
import type { LakehouseApiQueryFormat } from "@/lib/lakehouse/query.ts";

export type { LakehouseApiQueryFormat };
export type QueryResultFormat = "human" | "json" | LakehouseApiQueryFormat | "markdown";

const API_NATIVE_QUERY_FORMATS = new Set<string>(["csv", "jsonl", "parquet"]);
const QUERY_RESULT_FORMATS = new Set<QueryResultFormat>([
  "human",
  "json",
  "csv",
  "jsonl",
  "parquet",
  "markdown",
]);

export function isApiNativeQueryFormat(
  format: QueryResultFormat,
): format is LakehouseApiQueryFormat {
  return API_NATIVE_QUERY_FORMATS.has(format);
}

export function parseQueryResultFormat(format: string): QueryResultFormat {
  if (!QUERY_RESULT_FORMATS.has(format as QueryResultFormat)) {
    throw new CliError(`Unsupported format: ${format}. Use csv, jsonl, parquet, or markdown.`);
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
  if (isApiNativeQueryFormat(format)) {
    throw new CliError(`Format ${format} must be streamed from the lakehouse API.`);
  }
  return renderQueryHumanOutput(result, displayOptions ?? defaultDisplayOptions());
}

export async function writeQueryOutput(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
  format: QueryResultFormat,
  sink: OutputSink,
  displayOptions?: QueryDisplayOptions,
  pagerOptions?: PagerOptions,
  outputPath?: string,
): Promise<void> {
  const effectiveFormat = sink.json ? "json" : format;
  if (isApiNativeQueryFormat(effectiveFormat)) {
    throw new CliError(`Format ${effectiveFormat} must be streamed from the lakehouse API.`);
  }

  const outputText = renderQueryOutputText(result, effectiveFormat, displayOptions);
  const usePager = format === "human" && !sink.json && outputPath === undefined;

  if (usePager) {
    await writePagedOutput(outputText, pagerOptions ?? resolvePagerOptions(), sink);
    return;
  }

  if (outputPath !== undefined) {
    if (effectiveFormat === "json") {
      await writeQueryDestination(JSON.stringify(JSON.parse(outputText), null, 2), {
        outputPath,
      });
      return;
    }
    await writeQueryDestination(outputText, { outputPath });
    return;
  }

  if (effectiveFormat === "json" || sink.json) {
    sink.writeJson(JSON.parse(outputText));
    return;
  }

  sink.writeHuman(outputText);
}
