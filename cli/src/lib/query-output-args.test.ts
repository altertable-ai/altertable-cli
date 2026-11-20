import { describe, expect, test } from 'bun:test';

import { CliError } from '@/lib/errors.ts';
import {
  parseQueryOutputOptions,
  resolveQueryComputeSize,
} from '@/lib/query-output-args.ts';

describe('parseQueryOutputOptions', () => {
  test('composes explicit query presentation settings', () => {
    const options = parseQueryOutputOptions(
      {
        format: 'markdown',
        layout: 'line',
        columns: 'id, name',
        'max-width': '24',
        pager: 'never',
      },
      {
        agent: false,
        json: false,
        explicitOptions: new Set(['max-width', 'pager']),
      }
    );

    expect(options).toMatchObject({
      format: 'markdown',
      displayOptions: {
        layout: 'line',
        columns: ['id', 'name'],
        maxColumnWidth: 24,
      },
      pagerOptions: { mode: 'never' },
      computeSize: 'AUTO',
    });
  });

  test('derives machine-readable output from agent context', () => {
    expect(
      parseQueryOutputOptions(
        {},
        { agent: true, json: true, explicitOptions: new Set() }
      )
    ).toMatchObject({
      format: 'human',
      pagerOptions: { mode: 'never' },
      computeSize: 'AUTO',
    });
  });

  test('rejects incompatible or invalid presentation settings', () => {
    for (const run of [
      () =>
        parseQueryOutputOptions(
          {},
          { agent: true, json: true, explicitOptions: new Set(['layout']) }
        ),
      () =>
        parseQueryOutputOptions(
          { 'max-width': '4' },
          { agent: false, json: false, explicitOptions: new Set(['max-width']) }
        ),
      () =>
        parseQueryOutputOptions(
          { pager: 'sometimes' },
          { agent: false, json: false, explicitOptions: new Set(['pager']) }
        ),
    ]) {
      expect(run).toThrow(CliError);
    }
  });

  test('passes through request options', () => {
    const options = parseQueryOutputOptions(
      {
        format: 'jsonl',
        dialect: 'snowflake',
        catalog: 'analytics',
        schema: 'main',
        output: 'out.jsonl',
        'compute-size': 'L',
      },
      {
        agent: false,
        json: false,
        explicitOptions: new Set(['format', 'compute-size']),
      }
    );

    expect(options).toMatchObject({
      format: 'jsonl',
      dialect: 'snowflake',
      catalog: 'analytics',
      schema: 'main',
      outputPath: 'out.jsonl',
      computeSize: 'L',
    });
  });

  test('passes explicit AUTO with a session through to the request', () => {
    const options = parseQueryOutputOptions(
      { 'session-id': 'session-1', 'compute-size': 'AUTO' },
      {
        agent: false,
        json: false,
        explicitOptions: new Set(['session-id', 'compute-size']),
      }
    );

    expect(options.computeSize).toBe('AUTO');
  });
});

describe('resolveQueryComputeSize', () => {
  test('defaults to AUTO without a session', () => {
    expect(resolveQueryComputeSize({ computeSizeExplicit: false })).toBe(
      'AUTO'
    );
  });

  test('omits default AUTO when a session is present', () => {
    expect(
      resolveQueryComputeSize({
        sessionId: 'session-1',
        computeSizeExplicit: false,
      })
    ).toBeUndefined();
  });

  test('keeps explicit sizes with a session', () => {
    expect(
      resolveQueryComputeSize({
        sessionId: 'session-1',
        computeSizeArg: 'M',
        computeSizeExplicit: true,
      })
    ).toBe('M');
  });

  test('keeps explicit AUTO with a session for the backend to validate', () => {
    expect(
      resolveQueryComputeSize({
        sessionId: 'session-1',
        computeSizeArg: 'AUTO',
        computeSizeExplicit: true,
      })
    ).toBe('AUTO');
  });
});
