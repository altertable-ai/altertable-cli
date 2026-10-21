import { afterEach, beforeEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { prepareFilePreview } from '@/commands/app/lib/file-dev.ts';
import { dataAppPayload } from '@/commands/app/lib/payload.ts';
import { FROM_ENV_PSEUDOPROFILE_NAME } from '@/lib/profile-store.ts';
import { createLakehouseTestWorkspace } from '@/test-utils/lakehouse.ts';

let workspace: ReturnType<typeof createLakehouseTestWorkspace>;
let savedEnvironment: Record<string, string | undefined>;
beforeEach(() => {
  savedEnvironment = {
    ALTERTABLE_CONFIG_HOME: process.env.ALTERTABLE_CONFIG_HOME,
    ALTERTABLE_ENV: process.env.ALTERTABLE_ENV,
  };
  workspace = createLakehouseTestWorkspace('file-dev');
  process.env.ALTERTABLE_CONFIG_HOME = workspace.home;
  process.env.ALTERTABLE_ENV = 'production';
});
afterEach(() => {
  workspace.cleanup();
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function app(scope: string): string {
  return `import { defineDataApp as define } from "@altertable/data-app";
const app = define({ scope: ${scope}, queries: {} });`;
}

async function prepare(source: string): Promise<string> {
  const file = workspace.writeFile('index.tsx', source);
  return prepareFilePreview(file, FROM_ENV_PSEUDOPROFILE_NAME);
}

test('prepares a reusable dev project from the released manifest without executing the app', async () => {
  const directory = await prepare(
    `${app('{ organization: "acme", environment: "production" }')}
throw new Error("must not execute");`
  );
  const manifest = JSON.parse(
    await readFile(join(directory, 'package.json'), 'utf8')
  );
  const starter = JSON.parse(dataAppPayload.filePreview['package.json']!);
  expect(manifest.dependencies).toEqual(starter.dependencies);
  expect(manifest.scripts).toEqual({ dev: 'data-app-preview' });
  expect(await readFile(join(directory, 'bun.lock'), 'utf8')).toBe(
    dataAppPayload.filePreview['bun.lock']!
  );
  expect(existsSync(join(directory, 'server.ts'))).toBe(false);
  expect(
    await prepare(app('{ organization: "acme", environment: "production" }'))
  ).toBe(directory);
});

test('rejects invalid declarations and mismatched scopes before launching the preview', async () => {
  await rejects(
    prepare('export const app = 1;'),
    /Could not extract the data app manifest\.\n1:/
  );
  for (const scope of [
    'null',
    '{}',
    '{ organization: "acme", environment: "staging" }',
  ]) {
    await rejects(prepare(app(scope)), /data app file scope does not match/);
  }
  expect(existsSync(join(workspace.home, 'data-app-dev'))).toBe(true);
});
