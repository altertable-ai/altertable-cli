import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { runCommandWithTestRuntime } from '@/test-utils/cli.ts';
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from '@/test-utils/lakehouse.ts';

const QUERY_ID = '11111111-2222-3333-4444-555555555555';
const HUMAN = { debug: false, json: false, agent: false };

describe('query top command', () => {
  let workspace: LakehouseTestWorkspace;

  beforeEach(() => {
    workspace = createLakehouseTestWorkspace('query-top-command');
    workspace.writeMocks([
      {
        urlPattern: '/queries',
        method: 'GET',
        body: JSON.stringify({
          queries: [{ id: QUERY_ID, started_at: '2026-11-08T08:00:00Z' }],
        }),
      },
      {
        urlPattern: `/query/${QUERY_ID}`,
        method: 'GET',
        body: JSON.stringify({
          uuid: QUERY_ID,
          query: 'SELECT 1',
          percentage: 50,
        }),
      },
    ]);
  });

  afterEach(() => workspace.cleanup());

  test('lists running queries with details and exits', async () => {
    const harness = await runCommandWithTestRuntime(['query', 'top'], HUMAN);

    const output = harness.stdout.join('');
    expect(output).toContain(QUERY_ID);
    expect(output).toContain('50.0%');
    expect(output).toContain('SELECT 1');
  });

  test('emits merged list and detail entries as JSON', async () => {
    const harness = await runCommandWithTestRuntime(['query', 'top']);

    expect(JSON.parse(harness.stdout.join(''))).toEqual({
      queries: [
        {
          id: QUERY_ID,
          started_at: '2026-11-08T08:00:00Z',
          details: { uuid: QUERY_ID, query: 'SELECT 1', percentage: 50 },
        },
      ],
    });
  });

  test('rejects --watch with JSON output', async () => {
    expect(runCommandWithTestRuntime(['query', 'top', '-w'])).rejects.toThrow(
      '--watch cannot be combined with --json or --agent.'
    );
  });

  test('rejects --watch outside an interactive terminal', async () => {
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });
    try {
      expect(
        runCommandWithTestRuntime(['query', 'top', '--watch'], HUMAN)
      ).rejects.toThrow('--watch requires an interactive terminal.');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  test('rejects unknown sort keys', async () => {
    expect(
      runCommandWithTestRuntime(['query', 'top', '--sort', 'cpu'], HUMAN)
    ).rejects.toThrow('--sort');
  });

  test('rejects intervals below the minimum', async () => {
    expect(
      runCommandWithTestRuntime(['query', 'top', '--interval', '0.1'], HUMAN)
    ).rejects.toThrow('Invalid --interval');
    expect(
      runCommandWithTestRuntime(['query', 'top', '--interval', 'soon'], HUMAN)
    ).rejects.toThrow('Invalid --interval');
  });
});
