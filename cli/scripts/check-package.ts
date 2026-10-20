import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { smokeNpmBundle } from '@/../scripts/smoke-npm-bundle.ts';

const packageDirectory = join(import.meta.dir, '..');
const directory = await mkdtemp(join(tmpdir(), 'altertable-npm-consumer-'));

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: packageDirectory,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (await child.exited) {
    throw new Error(`Package check failed: ${command.join(' ')}`);
  }
}

try {
  const archive = join(directory, 'cli.tgz');
  await run([process.execPath, 'pm', 'pack', '--filename', archive]);
  await run(['tar', '-xzf', archive, '-C', directory]);
  const manifest = await Bun.file(
    join(directory, 'package/package.json')
  ).json();
  if (
    manifest.name !== '@altertable/cli' ||
    manifest.bin?.altertable !== './dist/cli.js'
  ) {
    throw new Error('Packed CLI name or executable entry is incorrect.');
  }
  await smokeNpmBundle([
    `--bundle=${join(directory, 'package', manifest.bin.altertable)}`,
  ]);
} finally {
  await rm(directory, { recursive: true, force: true });
}
