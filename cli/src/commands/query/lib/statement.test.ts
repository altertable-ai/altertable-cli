import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseQueryStatement } from '@/commands/query/lib/statement.ts';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'altertable-query-statement-'));
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('parseQueryStatement', () => {
  test('passes inline SQL through unchanged', () => {
    expect(parseQueryStatement('  SELECT 1  ')).toBe('  SELECT 1  ');
  });

  test('reads SQL from @file without trimming', () => {
    const path = join(directory, 'report.sql');
    writeFileSync(path, 'SELECT 1;\n');
    expect(parseQueryStatement(`@${path}`)).toBe('SELECT 1;\n');
  });

  test('reports a missing input file', () => {
    expect(() => parseQueryStatement('@/no/such/report.sql')).toThrow(
      'File not found: /no/such/report.sql'
    );
  });

  test('rejects an empty input file', () => {
    const path = join(directory, 'empty.sql');
    writeFileSync(path, '  \n');
    expect(() => parseQueryStatement(`@${path}`)).toThrow(
      `SQL file is empty: ${path}`
    );
  });
});
