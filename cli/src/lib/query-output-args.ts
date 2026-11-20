import { asCliArgString } from '@/lib/cli-args.ts';
import { defineArguments } from '@/lib/command.ts';
import {
  MIN_QUERY_MAX_COLUMN_WIDTH,
  parseQueryMaxColumnWidth,
} from '@/lib/config.ts';
import { CliError } from '@/lib/errors.ts';
import {
  resolvePagerOptions,
  type PagerMode,
  type PagerOptions,
} from '@/lib/pager.ts';
import {
  defaultDisplayOptions,
  type QueryDisplayOptions,
} from '@/lib/query-format.ts';
import {
  parseQueryResultFormat,
  type LakehouseApiQueryFormat,
  type QueryOutputOptions,
} from '@/lib/query-output.ts';
import { isQueryLayout, QUERY_LAYOUT_OPTIONS } from '@/ui/layouts/query.ts';

const PRESENTATION_RESULT_FORMAT_OPTIONS = ['csv', 'markdown'] as const;
const QUERY_RESULT_FORMAT_OPTIONS = [
  'csv',
  'jsonl',
  'parquet',
  'markdown',
] as const;
const PAGER_MODE_OPTIONS = ['auto', 'always', 'never'] as const;
const PAGER_MODES = new Set<PagerMode>(PAGER_MODE_OPTIONS);
const AGENT_INCOMPATIBLE_QUERY_FLAGS = [
  'layout',
  'pager',
  'max-width',
] as const;
const API_NATIVE_INCOMPATIBLE_PRESENTATION_FLAGS = [
  'layout',
  'columns',
  'max-width',
  'pager',
] as const;

/** Client-rendered formats shared by commands like `schema`. */
export const queryResultFormatArgs = defineArguments({
  format: {
    type: 'enum',
    description: 'Serialized output format; use global --json for JSON',
    options: [...PRESENTATION_RESULT_FORMAT_OPTIONS],
  },
});

/** Lakehouse query formats: csv/jsonl/parquet are API-native; markdown is CLI-rendered. */
export const queryApiResultFormatArgs = defineArguments({
  format: {
    type: 'enum',
    description:
      'Result format: csv, jsonl, and parquet stream from the API; markdown is rendered by the CLI. Use global --json for structured JSON',
    options: [...QUERY_RESULT_FORMAT_OPTIONS],
  },
});

export const queryDisplayArgs = defineArguments({
  layout: {
    type: 'enum',
    description: 'Human layout: auto, table, or line',
    options: [...QUERY_LAYOUT_OPTIONS],
  },
  columns: { type: 'string', description: 'Comma-separated columns to show' },
  'max-width': {
    type: 'string',
    description: 'Maximum display width for table columns',
    default: '32',
  },
});

export const queryPagerArgs = defineArguments({
  pager: {
    type: 'enum',
    description: 'Pager mode for human output: auto, always, or never',
    default: 'auto',
    options: [...PAGER_MODE_OPTIONS],
  },
});

type QueryOutputContext = {
  agent: boolean;
  explicitOptions: ReadonlySet<string>;
};

function validateAgentQueryFlags(options: QueryOutputContext): void {
  if (!options.agent) return;

  for (const flag of AGENT_INCOMPATIBLE_QUERY_FLAGS) {
    if (options.explicitOptions.has(flag)) {
      throw new CliError(
        `--${flag} cannot be used with --agent. Agent mode already selects structured JSON output.`
      );
    }
  }
}

export function validateApiNativeFormatFlags(
  format: LakehouseApiQueryFormat,
  options: QueryOutputContext & { json: boolean }
): void {
  if (options.json || options.agent) {
    throw new CliError(
      `--format ${format} cannot be combined with --json or --agent. Those flags expect structured CLI JSON output.`
    );
  }

  for (const flag of API_NATIVE_INCOMPATIBLE_PRESENTATION_FLAGS) {
    if (options.explicitOptions.has(flag)) {
      throw new CliError(`--${flag} cannot be used with --format ${format}.`);
    }
  }
}

function parseQueryLayout(layout: string): QueryDisplayOptions['layout'] {
  if (!isQueryLayout(layout))
    throw new CliError('--layout must be auto, table, or line.');
  return layout;
}

function parseDisplayOptions(
  args: Record<string, unknown>,
  explicitOptions: ReadonlySet<string>
): QueryDisplayOptions {
  const defaults = defaultDisplayOptions();
  let maxColumnWidth = defaults.maxColumnWidth;
  if (explicitOptions.has('max-width')) {
    const width = parseQueryMaxColumnWidth(asCliArgString(args['max-width']));
    if (width === undefined) {
      throw new CliError(
        `--max-width must be an integer >= ${MIN_QUERY_MAX_COLUMN_WIDTH}.`
      );
    }
    maxColumnWidth = width;
  }

  const columnsText =
    typeof args.columns === 'string' ? args.columns.trim() : '';
  const columns = columnsText
    ? columnsText
        .split(',')
        .map(name => name.trim())
        .filter(Boolean)
    : undefined;

  return {
    ...defaults,
    layout:
      args.layout === undefined
        ? defaults.layout
        : parseQueryLayout(asCliArgString(args.layout)),
    maxColumnWidth,
    columns,
  };
}

function parsePagerOptions(
  args: Record<string, unknown>,
  { agent, explicitOptions }: QueryOutputContext
): PagerOptions {
  if (agent) return { mode: 'never' };
  if (!explicitOptions.has('pager')) return resolvePagerOptions();

  const pager = asCliArgString(args.pager);
  if (!PAGER_MODES.has(pager as PagerMode)) {
    throw new CliError('--pager must be auto, always, or never.');
  }
  return resolvePagerOptions(pager as PagerMode);
}

export function parseQueryOutputOptions(
  args: Record<string, unknown>,
  options: QueryOutputContext
): QueryOutputOptions {
  validateAgentQueryFlags(options);
  const format = parseQueryResultFormat(
    args.format === undefined ? 'human' : asCliArgString(args.format)
  );

  return {
    format,
    displayOptions: parseDisplayOptions(args, options.explicitOptions),
    pagerOptions: parsePagerOptions(args, options),
  };
}
