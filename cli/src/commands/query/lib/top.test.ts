import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  createQueryTopFrameRenderer,
  fetchQueryTopSnapshot,
  formatBytes,
  formatClockTime,
  formatCount,
  formatElapsed,
  renderQueryTopTable,
  type QueryTopSnapshot,
  type QueryTopSortKey,
} from '@/commands/query/lib/top.ts';
import { createExecutionContext } from '@/lib/execution-context.ts';
import { getCliRuntime } from '@/lib/runtime.ts';
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from '@/test-utils/lakehouse.ts';
import { setTerminalColorMode } from '@/ui/terminal/styles.ts';

const OLDER_ID = '11111111-2222-3333-4444-555555555555';
const NEWER_ID = '22222222-3333-4444-5555-666666666666';

function runningDetails(id: string, startTime: string) {
  return {
    uuid: id,
    duration_ms: null,
    start_time: startTime,
    query: 'SELECT sum(i)\n  FROM range(20000000000) t(i)',
    percentage: 4.78,
    rows_processed: 956_012_544,
    total_rows: 20_000_000_002,
    user_agent: 'altertable-cli/1.14.0',
    worker: {
      slug: 'api-worker-xs-646cbf4877-7csgb',
      compute_size: 'XS',
      memory_usage_bytes: 3_030_078,
      memory_by_tag: [
        {
          tag: 'HASH_TABLE',
          memory_usage_bytes: 65_536,
          temporary_storage_bytes: 1_048_576,
        },
        {
          tag: 'ORDER_BY',
          memory_usage_bytes: 2_964_542,
          temporary_storage_bytes: 524_288,
        },
      ],
    },
  };
}

function snapshotWith(count: number): QueryTopSnapshot {
  return {
    queries: Array.from({ length: count }, (_, index) => ({
      id: `query-${index}`,
      started_at: '2026-11-08T08:00:00Z',
      details: null,
    })),
  };
}

function cells(line: string | undefined): string[] | undefined {
  return line?.trimEnd().split(/\s{2,}/);
}

describe('fetchQueryTopSnapshot', () => {
  let workspace: LakehouseTestWorkspace;

  beforeEach(() => {
    workspace = createLakehouseTestWorkspace('query-top');
  });

  afterEach(() => workspace.cleanup());

  function mockTwoQueries(): void {
    workspace.writeMocks([
      {
        urlPattern: '/queries',
        method: 'GET',
        body: JSON.stringify({
          queries: [
            { id: NEWER_ID, started_at: '2026-11-08T08:20:00Z' },
            { id: OLDER_ID, started_at: '2026-11-08T08:18:00Z' },
          ],
        }),
      },
      {
        urlPattern: `/query/${OLDER_ID}`,
        method: 'GET',
        body: JSON.stringify(runningDetails(OLDER_ID, '2026-11-08T08:18:00Z')),
      },
      {
        urlPattern: `/query/${NEWER_ID}`,
        method: 'GET',
        status: 404,
        body: '{"error":"not found"}',
      },
    ]);
  }

  async function fetchIds(sortKey: QueryTopSortKey): Promise<string[]> {
    const snapshot = await fetchQueryTopSnapshot(
      createExecutionContext(getCliRuntime()),
      sortKey
    );
    return snapshot.queries.map(query => query.id);
  }

  test('fetches details for each listed query and keeps failed lookups', async () => {
    mockTwoQueries();

    const snapshot = await fetchQueryTopSnapshot(
      createExecutionContext(getCliRuntime()),
      'elapsed'
    );

    expect(snapshot.queries[0]?.details).toMatchObject({ uuid: OLDER_ID });
    expect(snapshot.queries[1]).toEqual({
      id: NEWER_ID,
      started_at: '2026-11-08T08:20:00Z',
      details: null,
    });
    const log = workspace.readHttpLog();
    expect(log).toContain('URL=https://example.com/queries');
    expect(log).toContain(`URL=https://example.com/query/${OLDER_ID}`);
    expect(log).toContain(`URL=https://example.com/query/${NEWER_ID}`);
  });

  test('sorts largest first, with missing values last', async () => {
    mockTwoQueries();
    expect(await fetchIds('elapsed')).toEqual([OLDER_ID, NEWER_ID]);
    expect(await fetchIds('memory')).toEqual([OLDER_ID, NEWER_ID]);
    expect(await fetchIds('rows')).toEqual([OLDER_ID, NEWER_ID]);
    expect(await fetchIds('disk')).toEqual([OLDER_ID, NEWER_ID]);
  });

  test('skips detail lookups when nothing is running', async () => {
    workspace.writeMocks([
      { urlPattern: '/queries', method: 'GET', body: '{"queries":[]}' },
    ]);

    expect(await fetchIds('progress')).toEqual([]);
    expect(workspace.readHttpLog()).not.toContain('/query/');
  });
});

describe('renderQueryTopTable', () => {
  beforeEach(() => setTerminalColorMode('never'));
  afterEach(() => setTerminalColorMode(undefined));

  test('renders progress, estimated rows, worker, and a single-line statement', () => {
    const startTime = '2026-11-08T08:18:41Z';
    const output = renderQueryTopTable(
      {
        queries: [
          {
            id: OLDER_ID,
            started_at: startTime,
            details: runningDetails(OLDER_ID, startTime),
          },
        ],
      },
      { nowMs: Date.parse(startTime) + 75_000, terminalWidth: 260 }
    );

    const [header, row] = output.split('\n');
    expect(cells(header)).toEqual([
      'ID',
      'STARTED',
      'ELAPSED',
      'PROGRESS',
      'ROWS',
      'COMPUTE SIZE',
      'WORKER',
      'MEM',
      'DISK',
      'CLIENT',
      'QUERY',
    ]);
    expect(cells(row)).toEqual([
      OLDER_ID,
      formatClockTime(Date.parse(startTime)),
      '1m15s',
      '4.8%',
      '956M / ~20B',
      'XS',
      'api-worker-xs-646cbf4877-7csgb',
      '2.9 MiB',
      '1.5 MiB',
      'altertable-cli/1.14.0',
      'SELECT sum(i) FROM range(20000000000) t(i)',
    ]);
  });

  test('falls back to the listed start time when details are missing', () => {
    const output = renderQueryTopTable(
      {
        queries: [
          { id: NEWER_ID, started_at: '2026-11-08T08:20:00Z', details: null },
        ],
      },
      { nowMs: Date.parse('2026-11-08T08:20:02.5Z'), terminalWidth: 260 }
    );

    expect(cells(output.split('\n')[1])).toEqual([
      NEWER_ID,
      formatClockTime(Date.parse('2026-11-08T08:20:00Z')),
      '2.5s',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ]);
  });

  test('shows a dash for rows when nothing was scanned or estimated', () => {
    const output = renderQueryTopTable(
      {
        queries: [
          {
            id: OLDER_ID,
            started_at: null,
            details: { rows_processed: 0, total_rows: 0 },
          },
        ],
      },
      { terminalWidth: 260 }
    );

    expect(cells(output.split('\n')[1])?.[4]).toBe('-');
  });

  test('shows unknown progress when the server reports a negative estimate', () => {
    const output = renderQueryTopTable(
      {
        queries: [
          {
            id: OLDER_ID,
            started_at: null,
            details: { percentage: -1, rows_processed: 10 },
          },
        ],
      },
      { terminalWidth: 260 }
    );

    expect(cells(output.split('\n')[1])?.slice(3, 5)).toEqual(['-', '10 / ~?']);
  });

  test('prefers the reported duration once a query has finished', () => {
    const output = renderQueryTopTable(
      {
        queries: [
          {
            id: OLDER_ID,
            started_at: '2026-11-08T08:18:00Z',
            details: { duration_ms: 1_250 },
          },
        ],
      },
      { nowMs: Date.parse('2026-11-08T09:00:00Z'), terminalWidth: 260 }
    );

    expect(output).toContain('1.3s');
  });

  test('shows an unstyled empty-state message', () => {
    expect(renderQueryTopTable({ queries: [] })).toBe('No running queries.');
  });
});

describe('createQueryTopFrameRenderer', () => {
  beforeEach(() => setTerminalColorMode('never'));
  afterEach(() => setTerminalColorMode(undefined));

  test('keeps the last snapshot on screen when a refresh fails', async () => {
    const responses: Array<() => Promise<QueryTopSnapshot>> = [
      async () => snapshotWith(1),
      async () => {
        throw new Error('lakehouse unavailable');
      },
      async () => snapshotWith(2),
    ];
    const render = createQueryTopFrameRenderer(
      () => (responses.shift() as () => Promise<QueryTopSnapshot>)(),
      { intervalMs: 1_000, sortKey: 'memory' }
    );

    const first = await render({});
    const failed = await render({});
    const recovered = await render({});

    expect(first).toContain('1 running query · sorted by memory');
    expect(first).toContain('every 1s');
    expect(failed).toContain('lakehouse unavailable');
    expect(failed).toContain('query-0');
    expect(recovered).toContain('2 running queries');
    expect(recovered).not.toContain('lakehouse unavailable');
  });

  test('truncates rows to the terminal height', async () => {
    const render = createQueryTopFrameRenderer(async () => snapshotWith(20), {
      intervalMs: 1_000,
      sortKey: 'elapsed',
    });

    const lines = (await render({ rows: 10 })).split('\n');

    expect(lines.length).toBeLessThanOrEqual(9);
    expect(lines.at(-1)).toBe('… 15 more');
  });
});

describe('formatters', () => {
  test('formatElapsed', () => {
    expect(formatElapsed(undefined)).toBe('-');
    expect(formatElapsed(420)).toBe('420ms');
    expect(formatElapsed(3_000)).toBe('3s');
    expect(formatElapsed(12_340)).toBe('12.3s');
    expect(formatElapsed(65_000)).toBe('1m05s');
    expect(formatElapsed(3_723_000)).toBe('1h02m03s');
  });

  test('formatCount', () => {
    expect(formatCount(undefined)).toBe('?');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_500)).toBe('1.5K');
    expect(formatCount(2_312_087_435)).toBe('2.3B');
  });

  test('formatBytes', () => {
    expect(formatBytes(undefined)).toBe('-');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(12_286_243_248)).toBe('11.4 GiB');
  });

  test('formatClockTime', () => {
    expect(formatClockTime(undefined)).toBe('-');
    expect(formatClockTime(Date.parse('2026-11-08T08:18:41Z'))).toMatch(
      /^\d{2}:\d{2}:41$/
    );
  });
});
