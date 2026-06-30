import { readFileSync } from "node:fs";
import { isAgentMode } from "@/context.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError } from "@/lib/errors.ts";
import { defaultDisplayOptions } from "@/lib/query-format.ts";
import { resolvePagerOptions, type PagerMode, type PagerOptions } from "@/lib/pager.ts";
import { parseTimeoutSeconds } from "@/lib/timeout-args.ts";
import type { QueryDisplayOptions, QueryLayout } from "@/lib/query-format.ts";
import { parseQueryResultFormat, type QueryResultFormat } from "@/lib/lakehouse-client.ts";

const MIN_MAX_COLUMN_WIDTH = 8;
export const QUERY_RESULT_FORMAT_OPTIONS = ["human", "json", "csv", "markdown"] as const;
export const QUERY_LAYOUT_OPTIONS = ["auto", "table", "line"] as const;
export const PAGER_MODE_OPTIONS = ["auto", "always", "never"] as const;

const QUERY_LAYOUTS = new Set<QueryLayout>(QUERY_LAYOUT_OPTIONS);
const PAGER_MODES = new Set<PagerMode>(PAGER_MODE_OPTIONS);
const AGENT_INCOMPATIBLE_QUERY_FLAGS = ["--layout", "--pager", "--max-width"] as const;

export type QueryOutputOptions = {
  format: QueryResultFormat;
  displayOptions: QueryDisplayOptions;
  pagerOptions: PagerOptions;
};

function hasArgvFlag(rawArgs: readonly string[], flag: string): boolean {
  return rawArgs.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function validateAgentQueryFlags(rawArgs: readonly string[]): void {
  if (!isAgentMode()) {
    return;
  }

  for (const flag of AGENT_INCOMPATIBLE_QUERY_FLAGS) {
    if (hasArgvFlag(rawArgs, flag)) {
      throw new CliError(
        `${flag} cannot be used with --agent. Use --format json for machine-readable query output.`,
      );
    }
  }
}

function parseQueryResultFormatFromArgs(args: Record<string, unknown>): QueryResultFormat {
  if (isAgentMode()) {
    return "json";
  }

  const formatRaw = args.format !== undefined ? asCliArgString(args.format) : "human";
  return parseQueryResultFormat(formatRaw);
}

export function parseQueryResultFormatArg(
  args: Record<string, unknown>,
  rawArgs: readonly string[],
): QueryResultFormat {
  validateAgentQueryFlags(rawArgs);
  return parseQueryResultFormatFromArgs(args);
}

export function parseQueryLayout(args: Record<string, unknown>): QueryLayout {
  const defaults = defaultDisplayOptions();
  if (args.layout === undefined) {
    return defaults.layout;
  }

  const layoutRaw = asCliArgString(args.layout);
  if (!QUERY_LAYOUTS.has(layoutRaw as QueryLayout)) {
    throw new CliError("--layout must be auto, table, or line.");
  }
  return layoutRaw as QueryLayout;
}

export function parseQueryDisplayOptions(
  args: Record<string, unknown>,
  rawArgs: readonly string[],
): QueryDisplayOptions {
  validateAgentQueryFlags(rawArgs);
  return parseQueryDisplayOptionsFromArgs(args);
}

function parseQueryDisplayOptionsFromArgs(args: Record<string, unknown>): QueryDisplayOptions {
  const defaults = defaultDisplayOptions();
  let maxColumnWidth = defaults.maxColumnWidth;
  if (args["max-width"] !== undefined) {
    const maxColWidthRaw = asCliArgString(args["max-width"]);
    const parsedWidth = Number.parseInt(maxColWidthRaw, 10);
    if (Number.isNaN(parsedWidth) || parsedWidth < MIN_MAX_COLUMN_WIDTH) {
      throw new CliError(`--max-width must be an integer >= ${MIN_MAX_COLUMN_WIDTH}.`);
    }
    maxColumnWidth = parsedWidth;
  }

  const columnsRaw = args.columns;
  const columnsText = typeof columnsRaw === "string" ? columnsRaw.trim() : "";
  const columns =
    columnsText.length > 0
      ? columnsText
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      : undefined;

  return {
    ...defaults,
    layout: parseQueryLayout(args),
    maxColumnWidth,
    columns,
  };
}

function parsePagerOptionsFromArgs(args: Record<string, unknown>): PagerOptions {
  if (isAgentMode()) {
    return { mode: "never" };
  }

  if (args.pager === undefined) {
    return resolvePagerOptions();
  }
  const pagerRaw = asCliArgString(args.pager);
  if (!PAGER_MODES.has(pagerRaw as PagerMode)) {
    throw new CliError("--pager must be auto, always, or never.");
  }
  return resolvePagerOptions(pagerRaw as PagerMode);
}

export function parsePagerOptions(
  args: Record<string, unknown>,
  rawArgs: readonly string[] = [],
): PagerOptions {
  validateAgentQueryFlags(rawArgs);
  return parsePagerOptionsFromArgs(args);
}

export function parseQueryOutputOptions(
  args: Record<string, unknown>,
  rawArgs: readonly string[],
): QueryOutputOptions {
  validateAgentQueryFlags(rawArgs);
  return {
    format: parseQueryResultFormatFromArgs(args),
    displayOptions: parseQueryDisplayOptionsFromArgs(args),
    pagerOptions: parsePagerOptionsFromArgs(args),
  };
}

export function parseRequestReadTimeoutMs(args: Record<string, unknown>): number | undefined {
  if (args["read-timeout"] === undefined) {
    return undefined;
  }
  return parseTimeoutSeconds(args["read-timeout"], "--read-timeout");
}

export function parseAppendJsonContent(dataArg: string): string {
  let jsonContent = dataArg;
  if (jsonContent.startsWith("@")) {
    const filePath = jsonContent.slice(1);
    try {
      jsonContent = readFileSync(filePath, "utf8");
    } catch {
      throw new CliError(`File not found: ${filePath}`);
    }
  }

  const trimmed = jsonContent.replace(/\s/g, "");
  const firstChar = trimmed[0];
  if (firstChar !== "{" && firstChar !== "[") {
    throw new CliError("Data must be a JSON object or array.");
  }

  try {
    return JSON.stringify(JSON.parse(jsonContent));
  } catch {
    throw new CliError("Data must be valid JSON.");
  }
}

export function parseLakehouseFileContentType(format: string | undefined): string | undefined {
  if (!format) {
    return undefined;
  }

  switch (format.toLowerCase()) {
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "parquet":
      return "application/vnd.apache.parquet";
    default:
      throw new CliError("--format must be one of: csv, json, parquet.");
  }
}
