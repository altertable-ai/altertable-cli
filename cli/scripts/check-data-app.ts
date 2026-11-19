import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { dataAppDirectory } from '@/commands/app/lib/distribution-source.ts';

// Check outside the checkout so formatters inspect the Git-ignored generated source too.
const fixture = await mkdtemp(join(tmpdir(), 'data-app-check-'));
try {
  const starter = join(dataAppDirectory, 'starter');
  await cp(starter, fixture, {
    recursive: true,
    filter: path =>
      !['node_modules', 'dist', '.altertable'].includes(basename(path)) &&
      !basename(path).startsWith('.env'),
  });
  await symlink(join(starter, 'node_modules'), join(fixture, 'node_modules'));
  for (const project of [fixture, join(dataAppDirectory, 'tests')]) {
    const commands = [
      ...['typecheck', 'lint', 'format:check'].map(name => ['run', name]),
      ...(project === fixture ? [['run', 'build']] : []),
    ];
    for (const args of commands) {
      const child = Bun.spawn([process.execPath, ...args], {
        cwd: project,
        stdout: 'inherit',
        stderr: 'inherit',
      });
      if (await child.exited)
        throw new Error(`${project}: bun ${args.join(' ')} failed`);
    }
  }
} finally {
  await rm(fixture, { recursive: true, force: true });
}
