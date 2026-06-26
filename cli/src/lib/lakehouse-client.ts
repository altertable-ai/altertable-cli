import { getCliContext } from "@/context.ts";
import { writeLakehouseCommandOutput, type LakehouseOutputOptions } from "@/lib/command-output.ts";
import { getOutputSink, type OutputSink } from "@/lib/runtime.ts";
import { CliError } from "@/lib/errors.ts";
import {
  defaultDisplayOptions,
  formatQueryCellRaw,
  getQueryColumnNames,
  renderQueryHumanOutput,
  renderQueryMarkdown,
  type QueryDisplayOptions,
} from "@/lib/query-format.ts";
import { writePagedOutput, type PagerOptions } from "@/lib/pager.ts";

export {
  lakehouseAppend,
  lakehouseAutocomplete,
  lakehouseCancel,
  lakehouseGetQuery,
  lakehouseGetTask,
  lakehouseQuery,
  lakehouseQueryAll,
  lakehouseQueryStream,
  lakehouseUpload,
  lakehouseValidate,
  type LakehouseAppendOptions,
  type LakehouseAutocompleteOptions,
} from "@/lib/lakehouse-transport.ts";

export {
  parseLakehouseQueryResponse,
  parseLakehouseQueryStream,
  type LakehouseColumn,
  type LakehouseQueryResult,
  type LakehouseQueryStreamResult,
  type LakehouseRow,
} from "@/lib/lakehouse-ndjson.ts";

export { getQueryColumnNames } from "@/lib/query-format.ts";
export type { QueryDisplayOptions } from "@/lib/query-format.ts";

export type QueryOutputFormat = "json" | "table" | "csv" | "markdown";

const QUERY_OUTPUT_FORMATS = new Set<QueryOutputFormat>(["json", "table", "csv", "markdown"]);

export function parseQueryFormat(format: string): QueryOutputFormat {
  if (!QUERY_OUTPUT_FORMATS.has(format as QueryOutputFormat)) {
    throw new CliError(`Unsupported format: ${format}. Use json, table, csv, or markdown.`);
  }
  return format as QueryOutputFormat;
}

export function renderQueryTable(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
  options?: Partial<QueryDisplayOptions>,
): string {
  const displayOptions = { ...defaultDisplayOptions(), layout: "table" as const, ...options };
  return renderQueryHumanOutput(result, displayOptions);
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

export function formatAutocompleteHumanOutput(parsed: unknown): string {
  const body = parsed as {
    suggestions?: Array<{ suggestion?: string }>;
  };
  if (!Array.isArray(body.suggestions)) {
    return JSON.stringify(parsed);
  }
  return body.suggestions
    .map((entry) => entry.suggestion ?? "")
    .filter((suggestion) => suggestion.length > 0)
    .join("\n");
}

export function writeLakehouseOutput(body: string, options?: LakehouseOutputOptions): void {
  writeLakehouseCommandOutput(body, options);
}

export function renderQueryOutputText(
  result: import("./lakehouse-ndjson.ts").LakehouseQueryResult,
  format: QueryOutputFormat,
  displayOptions?: QueryDisplayOptions,
): string {
  if (getCliContext().json || format === "json") {
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
  format: QueryOutputFormat,
  displayOptions?: QueryDisplayOptions,
  pagerOptions?: PagerOptions,
  sink: OutputSink = getOutputSink(),
): Promise<void> {
  const outputText = renderQueryOutputText(result, format, displayOptions);
  const usePager = format === "table" && !sink.json;

  if (usePager) {
    await writePagedOutput(outputText, pagerOptions ?? {}, sink);
    return;
  }

  sink.writeHuman(outputText);
}
