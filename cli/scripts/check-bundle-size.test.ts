import { test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkBundleSize } from '@/../scripts/check-bundle-size.ts';

test('enforces the shipped bundle budget, including missing and empty artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cli-bundle-budget-'));
  const path = join(directory, 'cli.js');
  try {
    await rejects(checkBundleSize(path), /Missing or empty/);
    await Bun.write(path, '');
    await rejects(checkBundleSize(path), /Missing or empty/);
    await Bun.write(path, new Uint8Array(1024 * 1024));
    await checkBundleSize(path);
    await Bun.write(path, new Uint8Array(1024 * 1024 + 1));
    await rejects(
      checkBundleSize(path),
      /1,048,577 bytes \/ 1,048,576 byte budget/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
