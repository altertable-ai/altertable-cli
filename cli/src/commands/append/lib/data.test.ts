import { describe, expect, test } from 'bun:test';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseAppendJsonContent } from '@/commands/append/lib/data.ts';
import { CliError } from '@/lib/errors.ts';

describe('parseAppendJsonContent', () => {
  test('preserves inline JSON without rounding large integers', () => {
    const input = '{ "id": 9007199254740993 }';
    expect(parseAppendJsonContent(input)).toBe(input);
  });

  test('rejects non-JSON data', () => {
    expect(() => parseAppendJsonContent('not-json')).toThrow(CliError);
  });

  test('reads JSON from @file', () => {
    const path = join(tmpdir(), `altertable-append-${process.pid}.json`);
    writeFileSync(path, '[{"id":1}]');
    try {
      expect(parseAppendJsonContent(`@${path}`)).toBe('[{"id":1}]');
    } finally {
      rmSync(path, { force: true });
    }
  });

  test('reports a missing input file', () => {
    expect(() => parseAppendJsonContent('@/no/such/missing.json')).toThrow(
      'File not found: /no/such/missing.json'
    );
  });
});
