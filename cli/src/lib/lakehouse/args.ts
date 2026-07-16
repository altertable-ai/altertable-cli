import { defineArgs } from "@/lib/command.ts";
import { isAgentMode } from "@/context.ts";
import { asCliArgString } from "@/lib/cli-args.ts";
import { CliError } from "@/lib/errors.ts";
import { defaultDisplayOptions } from "@/lib/query-format.ts";
import { resolvePagerOptions, type PagerMode, type PagerOptions } from "@/lib/pager.ts";
import { parseTimeoutSeconds } from "@/lib/timeout-args.ts";
import type { QueryDisplayOptions } from "@/lib/query-format.ts";
import { parseQueryResultFormat, type QueryResultFormat } from "@/lib/lakehouse-client.ts";
import { isQueryLayout, QUERY_LAYOUT_OPTIONS, type QueryLayout } from "@/ui/layouts/query.ts";

const MIN_MAX_COLUMN_WIDTH = 8;
export const QUERY_RESULT_FORMAT_OPTIONS = ["human", "json", "csv", "markdown"] as const;
export const PAGER_MODE_OPTIONS = ["auto", "always", "never"] as const;
export const LAKEHOUSE_FILE_FORMAT_OPTIONS = ["csv", "json", "parquet"] as const;
const requestReadTimeoutArg = {
  type: "string",
  description: "Read timeout in seconds for this request (overrides global --read-timeout)",
} as const;

export const lakehouseTableArgs = defineArgs({
  catalog: { type: "string", description: "Catalog name", required: true },
  schema: { type: "string", description: "Schema name", required: true },
  table: { type: "string", description: "Table name", required: true },
});

export const lakehouseFileArgs = defineArgs({
  ...lakehouseTableArgs,
  format: {
    type: "enum",
    description: "Optional file format hint for the Content-Type header",
    options: [...LAKEHOUSE_FILE_FORMAT_OPTIONS],
  },
  file: { type: "string", description: "Local file to upload", required: true },
  "read-timeout": requestReadTimeoutArg,
});

export const queryRunArgs = defineArgs({
  statement: { type: "positional", description: "SQL statement to run", required: false },
  format: {
    type: "enum",
    description: "Output format: human, json, csv, or markdown",
    default: "human",
    options: [...QUERY_RESULT_FORMAT_OPTIONS],
  },
  layout: {
    type: "enum",
    description: "Human layout: auto, table, or line",
    options: [...QUERY_LAYOUT_OPTIONS],
  },
  "query-id": { type: "string", description: "Optional stable query id" },
  "session-id": { type: "string", description: "Optional session id" },
  columns: {
    type: "string",
    description: "Comma-separated columns to show",
  },
  "max-width": {
    type: "string",
    description: "Maximum display width for table columns",
    default: "32",
  },
  pager: {
    type: "enum",
    description: "Pager mode for human output: auto, always, or never",
    default: "auto",
    options: [...PAGER_MODE_OPTIONS],
  },
  "read-timeout": requestReadTimeoutArg,
});

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
  if (!isQueryLayout(layoutRaw)) {
    throw new CliError("--layout must be auto, table, or line.");
  }
  return layoutRaw;
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
