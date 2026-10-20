import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { recommendedDataAppVersion } from '@/commands/app/lib/package.ts';
import { dataAppPayload } from '@/commands/app/lib/payload.ts';
import { readRequiredFile } from '@/commands/app/lib/remote.ts';
import { assertAppScope, profileAppScope } from '@/commands/app/lib/scope.ts';
import { configDir } from '@/lib/config-files.ts';
import { ConfigurationError } from '@/lib/errors.ts';

/** Prepare a regular dev project backed by the starter's pinned runtime. */
export async function prepareFilePreview(
  file: string,
  profile: string
): Promise<string> {
  const source = await readRequiredFile(file, 'source');
  // Keep the TypeScript compiler off the startup path of other CLI commands.
  const { extractDataAppManifest } =
    await import('@altertable/data-app-manifest');
  const { manifest, diagnostics } = extractDataAppManifest(source);
  if (!manifest) {
    const details = diagnostics
      .slice(0, 3)
      .map(({ message, start }) => `${start.line}:${start.column}: ${message}`)
      .join('\n');
    throw new ConfigurationError(
      `Could not extract the data app manifest.\n${details}`
    );
  }
  assertAppScope(manifest.scope, profileAppScope(profile), 'data app file');

  const directory = join(
    configDir(),
    'data-app-dev',
    recommendedDataAppVersion()
  );
  const starter = dataAppPayload.starter;
  const packageJson = JSON.parse(starter['package.json']!);
  packageJson.scripts = { dev: 'data-app-preview' };
  await mkdir(directory, { recursive: true });
  const files = {
    'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    'bun.lock': starter['bun.lock']!,
    'bunfig.toml': starter['bunfig.toml']!,
  };
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(join(directory, name), content)
    )
  );
  return directory;
}
