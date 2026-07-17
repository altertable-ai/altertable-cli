import { asCliArgString } from "@/lib/cli-args.ts";
import { defineArgs } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import { parseQueryResultFormat, type QueryResultFormat } from "@/lib/query-output.ts";
import { resolvePagerOptions, type PagerMode, type PagerOptions } from "@/lib/pager.ts";
import { defaultDisplayOptions, type QueryDisplayOptions } from "@/lib/query-format.ts";
import { isQueryLayout, QUERY_LAYOUT_OPTIONS } from "@/ui/layouts/query.ts";

const MIN_MAX_COLUMN_WIDTH = 8;
const QUERY_RESULT_FORMAT_OPTIONS = ["csv", "markdown"] as const;
const PAGER_MODE_OPTIONS = ["auto", "always", "never"] as const;
const PAGER_MODES = new Set<PagerMode>(PAGER_MODE_OPTIONS);
const AGENT_INCOMPATIBLE_QUERY_FLAGS = ["--layout", "--pager", "--max-width"] as const;

export const queryResultFormatArgs = defineArgs({
  format: {
    type: "enum",
    description: "Serialized output format; use global --json for JSON",
    options: [...QUERY_RESULT_FORMAT_OPTIONS],
  },
});

export const queryDisplayArgs = defineArgs({
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

export const queryPagerArgs = defineArgs({
  pager: {
    type: "enum",
    description: "Pager mode for human output: auto, always, or never",
    default: "auto",
    options: [...PAGER_MODE_OPTIONS],
  },
});

export type QueryOutputOptions = {
  format: QueryResultFormat;
  displayOptions: QueryDisplayOptions;
  pagerOptions: PagerOptions;
};

type ParseQueryOutputOptions = {
  agent: boolean;
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

export function parseQueryOutputOptions(
  args: Record<string, unknown>,
  options: ParseQueryOutputOptions,
): QueryOutputOptions {
  validateAgentQueryFlags(options);
  const format = parseQueryResultFormat(
    args.format === undefined ? "human" : asCliArgString(args.format),
  );
  return {
    format,
    displayOptions: parseDisplayOptions(args),
    pagerOptions: parsePagerOptions(args, options.agent),
  };
}
