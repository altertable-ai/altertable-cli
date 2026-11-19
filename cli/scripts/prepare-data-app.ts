import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  dataAppDirectory,
  readDataAppPayload,
} from '@/commands/app/lib/distribution-source.ts';
import { createAppFiles } from '@/commands/app/lib/distribution.ts';

// This disposable project is the same scaffold shipped in the CLI, not another source template.
const files = createAppFiles(await readDataAppPayload(), {
  name: 'data-app-starter',
  title: 'CLI scaffold test',
  scope: { organization: 'Acme', environment: 'production' },
});
const directory = join(dataAppDirectory, 'starter');
for (const name of await readdir(directory)) {
  if (name === 'bun.lock' || name === 'node_modules' || name.startsWith('.env'))
    continue;
  await rm(join(directory, name), { recursive: true, force: true });
}
for (const [name, content] of Object.entries(files)) {
  await mkdir(dirname(join(directory, name)), { recursive: true });
  await writeFile(join(directory, name), content);
}
