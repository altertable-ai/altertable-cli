import { asCliArgString } from "@/lib/cli-args.ts";
import { defineArguments } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import {
  isApiNativeQueryFormat,
  parseQueryResultFormat,
  type QueryResultFormat,
} from "@/lib/query-output.ts";
import { resolvePagerOptions, type PagerMode, type PagerOptions } from "@/lib/pager.ts";
import { defaultDisplayOptions, type QueryDisplayOptions } from "@/lib/query-format.ts";
import { isQueryLayout, QUERY_LAYOUT_OPTIONS } from "@/ui/layouts/query.ts";

const MIN_MAX_COLUMN_WIDTH = 8;
const PRESENTATION_RESULT_FORMAT_OPTIONS = ["csv", "markdown"] as const;
const QUERY_RESULT_FORMAT_OPTIONS = ["csv", "jsonl", "parquet", "markdown"] as const;
const COMPUTE_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "AUTO"] as const;
const PAGER_MODE_OPTIONS = ["auto", "always", "never"] as const;
const PAGER_MODES = new Set<PagerMode>(PAGER_MODE_OPTIONS);
const AGENT_INCOMPATIBLE_QUERY_FLAGS = ["--layout", "--pager", "--max-width"] as const;
const API_NATIVE_INCOMPATIBLE_PRESENTATION_FLAGS = [
  "--layout",
  "--columns",
  "--max-width",
  "--pager",
] as const;

/** Client-rendered formats shared by commands like `schema`. */
export const queryResultFormatArgs = defineArguments({
  format: {
    type: "enum",
    description: "Serialized output format; use global --json for JSON",
    options: [...PRESENTATION_RESULT_FORMAT_OPTIONS],
  },
});

/** Lakehouse query formats: csv/jsonl/parquet are API-native; markdown is CLI-rendered. */
export const queryApiResultFormatArgs = defineArguments({
  format: {
    type: "enum",
    description:
      "Result format: csv, jsonl, and parquet stream from the API; markdown is rendered by the CLI. Use global --json for structured JSON",
    options: [...QUERY_RESULT_FORMAT_OPTIONS],
  },
});

export const queryDisplayArgs = defineArguments({
  layout: {
    type: "enum",
    description: "Human layout: auto, table, or line",
    options: [...QUERY_LAYOUT_OPTIONS],
  },
  columns: { type: "string", description: "Comma-separated columns to show" },
  "max-width": {
    type: "string",
    description: "Maximum display width for table columns",
    default: "32",
  },
});

export const queryPagerArgs = defineArguments({
  pager: {
    type: "enum",
    description: "Pager mode for human output: auto, always, or never",
    default: "auto",
    options: [...PAGER_MODE_OPTIONS],
  },
});

export const queryRequestArgs = defineArguments({
  "compute-size": {
    type: "enum",
    description: "Compute size for the query (AUTO cannot be combined with --session-id)",
    default: "AUTO",
    options: [...COMPUTE_SIZE_OPTIONS],
  },
  dialect: {
    type: "string",
    description: "Source SQL dialect to transpile from (server default: DuckDB)",
  },
  catalog: {
    type: "string",
    description: "Catalog name (optional; can also come from the session)",
  },
  schema: {
    type: "string",
    description: "Schema name (optional; can also come from the session)",
  },
  output: {
    type: "string",
    description: "Write result bytes/text to this path instead of stdout",
  },
});

export type QueryOutputOptions = {
  format: QueryResultFormat;
  displayOptions: QueryDisplayOptions;
  pagerOptions: PagerOptions;
  outputPath?: string;
  computeSize?: string;
  dialect?: string;
  catalog?: string;
  schema?: string;
};

type ParseQueryOutputOptions = {
  agent: boolean;
  json: boolean;
  rawArgs: readonly string[];
};

function hasArgvFlag(rawArgs: readonly string[], flag: string): boolean {
  return rawArgs.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function validateAgentQueryFlags(options: ParseQueryOutputOptions): void {
  if (!options.agent) return;

  for (const flag of AGENT_INCOMPATIBLE_QUERY_FLAGS) {
    if (hasArgvFlag(options.rawArgs, flag)) {
      throw new CliError(
        `${flag} cannot be used with --agent. Agent mode already selects structured JSON output.`,
      );
    }
  }
}

function validateApiNativeFormatFlags(
  format: QueryResultFormat,
  options: ParseQueryOutputOptions,
): void {
  if (!isApiNativeQueryFormat(format)) return;

  if (options.json || options.agent) {
    throw new CliError(
      `--format ${format} cannot be combined with --json or --agent. Those flags expect structured CLI JSON output.`,
    );
  }

  for (const flag of API_NATIVE_INCOMPATIBLE_PRESENTATION_FLAGS) {
    if (hasArgvFlag(options.rawArgs, flag)) {
      throw new CliError(`${flag} cannot be used with --format ${format}.`);
    }
  }
}

function parseQueryLayout(args: Record<string, unknown>): QueryDisplayOptions["layout"] {
  const defaults = defaultDisplayOptions();
  if (args.layout === undefined) return defaults.layout;

  const layout = asCliArgString(args.layout);
  if (!isQueryLayout(layout)) throw new CliError("--layout must be auto, table, or line.");
  return layout;
}

function parseDisplayOptions(args: Record<string, unknown>): QueryDisplayOptions {
  const defaults = defaultDisplayOptions();
  let maxColumnWidth = defaults.maxColumnWidth;
  if (args["max-width"] !== undefined) {
    const width = Number.parseInt(asCliArgString(args["max-width"]), 10);
    if (Number.isNaN(width) || width < MIN_MAX_COLUMN_WIDTH) {
      throw new CliError(`--max-width must be an integer >= ${MIN_MAX_COLUMN_WIDTH}.`);
    }
    maxColumnWidth = width;
  }

  const columnsText = typeof args.columns === "string" ? args.columns.trim() : "";
  const columns = columnsText
    ? columnsText
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : undefined;

  return { ...defaults, layout: parseQueryLayout(args), maxColumnWidth, columns };
}

function parsePagerOptions(args: Record<string, unknown>, agent: boolean): PagerOptions {
  if (agent) return { mode: "never" };
  if (args.pager === undefined) return resolvePagerOptions();

  const pager = asCliArgString(args.pager);
  if (!PAGER_MODES.has(pager as PagerMode)) {
    throw new CliError("--pager must be auto, always, or never.");
  }
  return resolvePagerOptions(pager as PagerMode);
}

function optionalTrimmedString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function resolveQueryComputeSize(options: {
  sessionId?: string;
  computeSizeArg?: string;
  computeSizeExplicit: boolean;
}): string | undefined {
  const computeSize = options.computeSizeArg ?? "AUTO";

  if (options.sessionId) {
    if (options.computeSizeExplicit && computeSize === "AUTO") {
      throw new CliError("--compute-size AUTO cannot be combined with --session-id.");
    }
    if (!options.computeSizeExplicit) return undefined;
    return computeSize;
  }

  return computeSize;
}

export function parseQueryOutputOptions(
  args: Record<string, unknown>,
  options: ParseQueryOutputOptions,
): QueryOutputOptions {
  validateAgentQueryFlags(options);
  const format = parseQueryResultFormat(
    args.format === undefined ? "human" : asCliArgString(args.format),
  );
  validateApiNativeFormatFlags(format, options);

  const sessionId = optionalTrimmedString(args, "session-id");
  const computeSize = resolveQueryComputeSize({
    sessionId,
    computeSizeArg:
      args["compute-size"] === undefined ? undefined : asCliArgString(args["compute-size"]),
    computeSizeExplicit: hasArgvFlag(options.rawArgs, "--compute-size"),
  });

  return {
    format,
    displayOptions: parseDisplayOptions(args),
    pagerOptions: parsePagerOptions(args, options.agent),
    outputPath: optionalTrimmedString(args, "output"),
    computeSize,
    dialect: optionalTrimmedString(args, "dialect"),
    catalog: optionalTrimmedString(args, "catalog"),
    schema: optionalTrimmedString(args, "schema"),
  };
}
