import { readFileSync } from "node:fs";
import { CliError } from "@/lib/errors.ts";
import { defaultDisplayOptions } from "@/lib/query-format.ts";
import { resolvePagerOptions, type PagerOptions } from "@/lib/pager.ts";
import { parseTimeoutSeconds } from "@/lib/timeout-args.ts";
import type { QueryDisplayOptions } from "@/lib/query-format.ts";

const MIN_MAX_COLUMN_WIDTH = 8;

function hasExplicitFlag(rawArgs: string[], flag: string): boolean {
  return rawArgs.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function parseQueryDisplayOptions(
  args: Record<string, unknown>,
  rawArgs: string[],
): QueryDisplayOptions {
  const expanded = Boolean(args.expanded);
  const noExpanded = Boolean(args["no-expanded"]);
  if (expanded && noExpanded) {
    throw new CliError("Cannot use --expanded and --no-expanded together.");
  }

  const defaults = defaultDisplayOptions();
  let maxColumnWidth = defaults.maxColumnWidth;
  if (hasExplicitFlag(rawArgs, "--max-col-width")) {
    const maxColWidthRaw = String(args["max-col-width"]);
    const parsedWidth = Number.parseInt(maxColWidthRaw, 10);
    if (Number.isNaN(parsedWidth) || parsedWidth < MIN_MAX_COLUMN_WIDTH) {
      throw new CliError(`--max-col-width must be an integer >= ${MIN_MAX_COLUMN_WIDTH}.`);
    }
    maxColumnWidth = parsedWidth;
  }

  let layout: QueryDisplayOptions["layout"] = defaults.layout;
  if (expanded) {
    layout = "expanded";
  } else if (noExpanded) {
    layout = "table";
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
    layout,
    maxColumnWidth,
    columns,
  };
}

export function parsePagerOptions(args: Record<string, unknown>): PagerOptions {
  const pager = Boolean(args.pager);
  const noPager = Boolean(args["no-pager"]);
  if (pager && noPager) {
    throw new CliError("Cannot use --pager and --no-pager together.");
  }
  return resolvePagerOptions({
    force: pager || undefined,
    disable: noPager || undefined,
  });
}

export function parseRequestReadTimeoutMs(args: Record<string, unknown>): number | undefined {
  if (args.timeout === undefined) {
    return undefined;
  }
  return parseTimeoutSeconds(args.timeout, "--timeout");
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

export function validateUploadPrimaryKey(mode: string, primaryKey: unknown): void {
  if (mode === "upsert" && !primaryKey) {
    throw new CliError("--primary-key is required when --mode is upsert.");
  }
}
