import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getExampleDirectory } from '@altertable/data-app-examples';
import {
  extractDataAppManifest,
  overrideDataAppManifest,
} from '@altertable/data-app-manifest';

import type { DataAppPayload } from '@/commands/app/lib/distribution.ts';

export const dataAppDirectory = fileURLToPath(
  new URL('../../../../../data-app/', import.meta.url)
);
function assertRelativePath(path: string): void {
  if (
    path.includes('\\') ||
    path.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Invalid distribution path: ${path}`);
  }
}

/** Expand explicit package entries, rejecting symlinks and test/build artifacts. */
async function readFiles(
  directory: string,
  entries: readonly string[]
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function visit(name: string): Promise<void> {
    assertRelativePath(name);
    if (
      /(^|\/)(node_modules|tests?|fixtures|dist)(\/|$)|\.(test|spec)\./.test(
        name
      )
    ) {
      throw new Error(`Development artifact in distribution: ${name}`);
    }
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error(`Symlink in distribution: ${name}`);
    if (info.isDirectory()) {
      for (const child of (await readdir(path)).sort())
        await visit(`${name}/${child}`);
    } else if (info.isFile()) {
      files[name === '_gitignore' ? '.gitignore' : name] = await readFile(
        path,
        'utf8'
      );
    } else throw new Error(`Unsupported distribution file: ${name}`);
  }
  for (const entry of [...entries].sort()) await visit(entry);
  return files;
}

/** Embed project files; runtime packages are installed from npm. */
export async function readDataAppPayload(): Promise<DataAppPayload> {
  const example = getExampleDirectory('starter-local-data-app');
  const starter = await readFiles(example, await readdir(example));
  starter['bun.lock'] = await readFile(
    join(dataAppDirectory, 'starter/bun.lock'),
    'utf8'
  );
  const { manifest } = extractDataAppManifest(starter['app.ts']!);
  if (!manifest) throw new Error('Starter needs a literal app.ts declaration.');
  const template = overrideDataAppManifest(starter['app.ts']!, {
    ...manifest,
    title: '__APP_TITLE__',
    scope: {
      organization: '__APP_ORGANIZATION__',
      environment: '__APP_ENVIRONMENT__',
    },
  });
  if (!template.source)
    throw new Error('Cannot prepare the starter identity template.');
  starter['app.ts'] = template.source;
  return {
    starter,
    filePreview: await readFiles(join(dataAppDirectory, 'file-preview'), [
      'package.json',
      'bun.lock',
      'bunfig.toml',
      'extract-manifest.js',
    ]),
  };
}
