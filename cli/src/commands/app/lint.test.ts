import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  dataAppDirectory,
  readDataAppPayload,
} from '@/commands/app/lib/distribution-source.ts';
import { createAppFiles } from '@/commands/app/lib/distribution.ts';
import { checkAppProject, checkClientBundle } from '@/commands/app/lint.ts';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'app-contract-'));
  const files = createAppFiles(await readDataAppPayload(), {
    name: 'test-app',
    title: 'Test app',
    scope: { organization: 'test', environment: 'test' },
  });
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(directory, name, '..'), { recursive: true });
    await writeFile(join(directory, name), content);
  }
  await symlink(
    join(dataAppDirectory, 'starter/node_modules'),
    join(directory, 'node_modules')
  );
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('checks real published operations and their input parsers', async () => {
  await checkAppProject(directory);
  await writeFile(
    join(directory, 'src/operations.ts'),
    'export const operations = { totals: { checks: [{}], input: v => v, run: async () => ({}), policy: { maxQueryRows: 0, maxDurationMs: 0 } } };'
  );
  expect(checkAppProject(directory)).rejects.toThrow(
    'Data app validation failed.'
  );
});

test.each([
  '@altertable/data-app/server',
  '@altertable/data-app-bun',
  '@altertable/data-app-bun/preview',
])('browser code rejects server transport %s', async entry => {
  await writeFile(
    join(directory, 'src/main.tsx'),
    `import * as transport from "${entry}"; console.log(transport);`
  );
  expect(checkAppProject(directory)).rejects.toThrow(
    'Data app validation failed.'
  );
});

test('scans nested client chunks for references and credentials, excluding the server bundle', async () => {
  await mkdir(join(directory, 'dist/chunks'), { recursive: true });
  await writeFile(join(directory, 'dist/index.html'), '<html></html>');
  await writeFile(join(directory, 'dist/index-test.js'), 'console.log("safe")');
  const chunk = join(directory, 'dist/chunks/report.js');
  await writeFile(chunk, 'console.log("ALTERTABLE_LAKEHOUSE_PASSWORD")');
  expect(checkClientBundle(directory)).rejects.toThrow('chunks/report.js');
  await writeFile(chunk, 'console.log("secret-fixture-value")');
  expect(
    checkClientBundle(directory, ['secret-fixture-value'])
  ).rejects.toThrow('chunks/report.js');
  await writeFile(chunk, 'console.log("safe")');
  await writeFile(
    join(directory, 'dist/server.js'),
    'console.log("ALTERTABLE_LAKEHOUSE_PASSWORD")'
  );
  await checkClientBundle(directory);
});

test('lakehouse checks execute each input through the published operation client', async () => {
  const days: number[] = [];
  const lakehouse = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const { statement, params } = (await request.json()) as {
        statement: string;
        params: { day: number };
      };
      expect(statement).toBe('SELECT $day AS day');
      days.push(params.day);
      return new Response(
        `{"query_id":"check-${params.day}"}\n[{"name":"day","type":"INTEGER"}]\n[${params.day}]\n`
      );
    },
  });
  try {
    await writeFile(
      join(directory, 'app.ts'),
      `import { defineDataApp } from '@altertable/data-app';
export const dataApp = defineDataApp({ title: 'Existing app', scope: { organization: 'test', environment: 'test' }, queries: { daily: { statement: 'SELECT $day AS day', params: { day: { type: 'number' } }, projections: { day: { type: 'number' } } } } });`
    );
    await writeFile(
      join(directory, 'src/main.tsx'),
      'console.log("Fixture client");'
    );
    await writeFile(
      join(directory, 'src/operations.ts'),
      `import { dataApp } from '#config';
export const operations = dataApp.defineOperations({ daily: dataApp.defineOperation({
  policy: { maxQueryRows: 1, maxDurationMs: 1000 }, checks: [{ day: 1 }, { day: 2 }],
  input(value) { if (typeof value?.day !== 'number') throw new Error('Invalid day'); return value; },
  async run({ query }, input) { return (await query('daily', { day: input.day })).rows; },
}) });`
    );
    await checkAppProject(directory);
    expect(days).toEqual([]);
    await checkAppProject(directory, {
      ALTERTABLE_API_BASE: lakehouse.url.origin,
      ALTERTABLE_LAKEHOUSE_USERNAME: 'fixture',
      ALTERTABLE_LAKEHOUSE_PASSWORD: 'fixture',
    });
    expect(days).toEqual([1, 2]);
  } finally {
    await lakehouse.stop(true);
  }
});
