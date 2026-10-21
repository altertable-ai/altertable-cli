import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { recommendedDataAppVersion } from '@/commands/app/lib/package.ts';
import { dataAppPayload } from '@/commands/app/lib/payload.ts';
import { readRequiredFile } from '@/commands/app/lib/remote.ts';
import { runAppCommand } from '@/commands/app/lib/run.ts';
import { assertAppScope, profileAppScope } from '@/commands/app/lib/scope.ts';
import { configDir } from '@/lib/config-files.ts';
import { copyProcessEnv } from '@/lib/env.ts';
import { ConfigurationError } from '@/lib/errors.ts';

/** Install the pinned preview tools and verify scope before granting lakehouse access. */
export async function prepareFilePreview(
  file: string,
  profile: string
): Promise<string> {
  const source = await readRequiredFile(file, 'source');
  const directory = join(
    configDir(),
    'data-app-dev',
    recommendedDataAppVersion()
  );
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(dataAppPayload.filePreview).map(([name, content]) =>
      writeFile(join(directory, name), content)
    )
  );
  if ((await runAppCommand('install-frozen', directory)) !== 0) {
    throw new ConfigurationError('Could not install the file preview runtime.');
  }

  // Run the compiler in the installed preview project, outside the CLI bundle.
  const env = copyProcessEnv();
  for (const key of Object.keys(env)) {
    if (key.startsWith('ALTERTABLE_')) delete env[key];
  }
  env.BUN_BE_BUN = '1';
  const child = Bun.spawn(
    [process.execPath, join(directory, 'extract-manifest.js')],
    {
      cwd: directory,
      env,
      stdin: new Blob([source]),
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new ConfigurationError(
      `Could not extract the data app manifest.\n${stderr.trim()}`
    );
  }
  const { manifest, diagnostics } = JSON.parse(stdout) as {
    manifest: { scope?: unknown } | null;
    diagnostics: { message: string; start: { line: number; column: number } }[];
  };
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
  return directory;
}
