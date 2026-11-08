import type { ExecutionContext } from '@/lib/execution-context.ts';
import { sendHttp } from '@/lib/http-request.ts';
import {
  buildLakehouseQueryListRequest,
  buildLakehouseQueryShowRequest,
} from '@/lib/lakehouse/query.ts';
import { isRecord } from '@/lib/object.ts';
import { parseApiJson } from '@/lib/parse-api-json.ts';
import { pluralizeLabel } from '@/lib/pluralize.ts';
import {
  span,
  type DisplayTableColumn,
  type DisplayTableOptions,
} from '@/ui/document.ts';
import type { LiveViewport } from '@/ui/terminal/live-view.ts';
import { renderDisplayText } from '@/ui/terminal/styles.ts';
import { renderFixedTable } from '@/ui/terminal/table.ts';

/** Caps concurrent `GET /query/{id}` calls so large lists do not flood the API. */
const DETAIL_CONCURRENCY = 8;
/** Widest `formatBytes` output below the next unit, e.g. `1023.9 MiB`. */
const BYTES_WIDTH = 10;
/** Table header row plus the line the cursor rests on after a frame. */
const TABLE_CHROME_LINES = 2;

/** `--json` contract: the listed query plus its raw `GET /query/{id}` body. */
export type QueryTopEntry = {
  id: string;
  started_at: string | null;
  /** Null when the query finished before its lookup, or the lookup failed. */
  details: Record<string, unknown> | null;
};

export type QueryTopSnapshot = {
  queries: QueryTopEntry[];
};

/** Display model: every API field `query top` reads, narrowed in one place. */
type QueryTopRow = {
  id: string;
  startedAtMs?: number;
  durationMs?: number;
  statement?: string;
  /** Undefined when the server has no progress estimate (it reports -1). */
  progress?: number;
  rowsProcessed?: number;
  /** Server-side scan estimate, not an exact count. */
  estimatedTotalRows?: number;
  computeSize?: string;
  workerSlug?: string;
  userAgent?: string;
  /** Reported on the worker running the query (`worker.memory_usage_bytes`). */
  memoryBytes?: number;
  /** Spill to disk: the worker's `temporary_storage_bytes` summed over tags. */
  diskBytes?: number;
};

/** Every key sorts largest first; queries missing the value sort last. */
const SORT_VALUES = {
  elapsed: row =>
    row.startedAtMs === undefined ? undefined : -row.startedAtMs,
  progress: row => row.progress,
  rows: row => row.rowsProcessed,
  memory: row => row.memoryBytes,
  disk: row => row.diskBytes,
} satisfies Record<string, (row: QueryTopRow) => number | undefined>;

export type QueryTopSortKey = keyof typeof SORT_VALUES;
export const QUERY_TOP_SORT_KEYS = Object.keys(
  SORT_VALUES
) as readonly QueryTopSortKey[];

export async function fetchQueryTopSnapshot(
  execution: ExecutionContext,
  sortKey: QueryTopSortKey
): Promise<QueryTopSnapshot> {
  const listResponse = await sendHttp(
    buildLakehouseQueryListRequest(),
    execution
  );
  const listed = parseRunningQueries(parseApiJson(listResponse));
  const details = await mapWithConcurrency(listed, DETAIL_CONCURRENCY, query =>
    fetchQueryDetails(query.id, execution)
  );
  const queries = listed.map((query, index) => ({
    ...query,
    details: details[index] ?? null,
  }));
  const sortValue = (entry: QueryTopEntry) =>
    SORT_VALUES[sortKey](toQueryTopRow(entry)) ?? -Infinity;
  queries.sort((left, right) => sortValue(right) - sortValue(left));
  return { queries };
}

export function renderQueryTopTable(
  snapshot: QueryTopSnapshot,
  options: { nowMs?: number } & Pick<
    DisplayTableOptions<QueryTopRow>,
    'terminalWidth' | 'horizontalScroll'
  > = {}
): string {
  if (snapshot.queries.length === 0) {
    // Match `query list`, which prints this message unstyled.
    return 'No running queries.';
  }
  const { nowMs = Date.now(), ...tableOptions } = options;
  const columns: DisplayTableColumn<QueryTopRow>[] = [
    { header: 'id', cell: row => row.id },
    { header: 'started', cell: row => formatClockTime(row.startedAtMs) },
    {
      header: 'elapsed',
      cell: row => formatElapsed(row.durationMs ?? elapsedSince(row, nowMs)),
      minWidth: 9, // 10h02m03s
    },
    { header: 'progress', cell: row => formatPercentage(row.progress) },
    { header: 'rows', cell: formatRowsCell, minWidth: 16 }, // 999.9M / ~999.9B
    { header: 'compute size', cell: row => row.computeSize ?? '-' },
    { header: 'worker', cell: row => row.workerSlug ?? '-' },
    {
      header: 'mem',
      cell: row => formatBytes(row.memoryBytes),
      minWidth: BYTES_WIDTH,
    },
    {
      header: 'disk',
      cell: row => formatBytes(row.diskBytes),
      minWidth: BYTES_WIDTH,
    },
    { header: 'client', cell: row => row.userAgent ?? '-' },
    {
      header: 'query',
      cell: row => formatStatement(row.statement),
      flex: true,
    },
  ];
  return renderFixedTable(
    snapshot.queries.map(toQueryTopRow),
    columns,
    undefined,
    tableOptions
  );
}

/**
 * Builds `--watch` frames. Keeps the last good snapshot on screen when a
 * refresh fails, with the error shown above it.
 */
export function createQueryTopFrameRenderer(
  fetchSnapshot: () => Promise<QueryTopSnapshot>,
  options: { intervalMs: number; sortKey: QueryTopSortKey }
): (viewport: LiveViewport) => Promise<string> {
  let snapshot: QueryTopSnapshot = { queries: [] };
  return async viewport => {
    let errorMessage: string | undefined;
    try {
      snapshot = await fetchSnapshot();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    return renderQueryTopFrame(snapshot, {
      ...options,
      nowMs: Date.now(),
      errorMessage,
      maxRows: viewport.rows,
    });
  };
}

function renderQueryTopFrame(
  snapshot: QueryTopSnapshot,
  options: {
    nowMs: number;
    intervalMs: number;
    sortKey: QueryTopSortKey;
    errorMessage?: string;
    maxRows?: number;
  }
): string {
  const { queries } = snapshot;
  const lines = [
    renderDisplayText([
      span(
        pluralizeLabel(queries.length, 'running query', 'running queries'),
        'strong'
      ),
      span(
        ` · sorted by ${options.sortKey}` +
          ` · refreshed ${formatClockTime(options.nowMs)}` +
          ` · every ${formatElapsed(options.intervalMs)} · Ctrl+C to quit`,
        'subtle'
      ),
    ]),
  ];
  if (options.errorMessage !== undefined) {
    lines.push(renderDisplayText([span(options.errorMessage, 'error')]));
  }
  lines.push('');

  // At least one query row plus the "more" line when the list overflows.
  const rowBudget =
    options.maxRows === undefined
      ? Infinity
      : Math.max(2, options.maxRows - lines.length - TABLE_CHROME_LINES);
  const overflows = queries.length > rowBudget;
  const shown = overflows ? queries.slice(0, rowBudget - 1) : queries;
  lines.push(renderQueryTopTable({ queries: shown }, { nowMs: options.nowMs }));
  if (overflows) {
    lines.push(
      renderDisplayText([
        span(`… ${queries.length - shown.length} more`, 'subtle'),
      ])
    );
  }
  return lines.join('\n');
}

function toQueryTopRow(entry: QueryTopEntry): QueryTopRow {
  const details = entry.details ?? {};
  const worker = isRecord(details.worker) ? details.worker : {};
  const progress = optionalNumber(details.percentage);
  return {
    id: entry.id,
    startedAtMs:
      optionalTimestamp(details.start_time) ??
      optionalTimestamp(entry.started_at),
    durationMs: optionalNumber(details.duration_ms),
    statement: optionalString(details.query),
    progress: progress !== undefined && progress >= 0 ? progress : undefined,
    rowsProcessed: optionalNumber(details.rows_processed),
    estimatedTotalRows: optionalNumber(details.total_rows),
    computeSize: optionalString(worker.compute_size),
    workerSlug: optionalString(worker.slug),
    userAgent: optionalString(details.user_agent),
    memoryBytes: optionalNumber(worker.memory_usage_bytes),
    diskBytes: sumTemporaryStorageBytes(worker.memory_by_tag),
  };
}

function parseRunningQueries(data: unknown): Omit<QueryTopEntry, 'details'>[] {
  if (!isRecord(data) || !Array.isArray(data.queries)) {
    return [];
  }
  return data.queries.filter(isRecord).flatMap(query =>
    typeof query.id === 'string'
      ? [
          {
            id: query.id,
            started_at: optionalString(query.started_at) ?? null,
          },
        ]
      : []
  );
}

async function fetchQueryDetails(
  queryId: string,
  execution: ExecutionContext
): Promise<Record<string, unknown> | null> {
  try {
    const response = await sendHttp(
      buildLakehouseQueryShowRequest(queryId),
      execution
    );
    const data = parseApiJson(response);
    return isRecord(data) ? data : null;
  } catch {
    // The query may finish between listing and lookup; keep the listed row.
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (let index = nextIndex++; index < items.length; index = nextIndex++) {
      results[index] = await mapper(items[index] as T);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

function sumTemporaryStorageBytes(memoryByTag: unknown): number | undefined {
  if (!Array.isArray(memoryByTag)) {
    return undefined;
  }
  return memoryByTag
    .filter(isRecord)
    .reduce(
      (total, tag) =>
        total + (optionalNumber(tag.temporary_storage_bytes) ?? 0),
      0
    );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalTimestamp(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
}

function elapsedSince(row: QueryTopRow, nowMs: number): number | undefined {
  return row.startedAtMs === undefined
    ? undefined
    : Math.max(0, nowMs - row.startedAtMs);
}

function formatRowsCell(row: QueryTopRow): string {
  // Nothing scanned and nothing to scan (missing or 0) carries no information.
  if (!row.rowsProcessed && !row.estimatedTotalRows) {
    return '-';
  }
  return `${formatCount(row.rowsProcessed)} / ~${formatCount(row.estimatedTotalRows)}`;
}

function formatStatement(statement: string | undefined): string {
  return statement === undefined ? '-' : statement.replace(/\s+/g, ' ').trim();
}

export function formatClockTime(timestampMs: number | undefined): string {
  if (timestampMs === undefined) {
    return '-';
  }
  const date = new Date(timestampMs);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':');
}

export function formatElapsed(milliseconds: number | undefined): string {
  if (milliseconds === undefined) {
    return '-';
  }
  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)}ms`;
  }
  const totalSeconds = Math.floor(milliseconds / 1_000);
  if (totalSeconds < 60) {
    return `${(milliseconds / 1_000).toFixed(1).replace(/\.0$/, '')}s`;
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}h${String(minutes).padStart(2, '0')}m${seconds}s`
    : `${minutes}m${seconds}s`;
}

function formatPercentage(value: number | undefined): string {
  return value === undefined ? '-' : `${value.toFixed(1)}%`;
}

const COUNT_UNITS = [
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
] as const;

export function formatCount(value: number | undefined): string {
  if (value === undefined) {
    return '?';
  }
  const unit = COUNT_UNITS.find(
    candidate => Math.abs(value) >= candidate.value
  );
  if (unit === undefined) {
    return String(Math.round(value));
  }
  return `${(value / unit.value).toFixed(1).replace(/\.0$/, '')}${unit.suffix}`;
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

export function formatBytes(value: number | undefined): string {
  if (value === undefined) {
    return '-';
  }
  let scaled = value;
  let unitIndex = 0;
  while (Math.abs(scaled) >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }
  const digits = unitIndex === 0 ? 0 : 1;
  return `${scaled.toFixed(digits)} ${BYTE_UNITS[unitIndex]}`;
}
