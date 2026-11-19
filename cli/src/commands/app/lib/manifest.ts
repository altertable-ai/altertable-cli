import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { recommendedDataAppVersion } from '@/commands/app/lib/package.ts';
import { dataAppPayload } from '@/commands/app/lib/payload.ts';
import { runAppCommand } from '@/commands/app/lib/run.ts';
import { configDir } from '@/lib/config-files.ts';
import { copyProcessEnv } from '@/lib/env.ts';
import { ConfigurationError } from '@/lib/errors.ts';

export type AppManifest = {
  title: string;
  scope: { organization: string; environment: string };
  appearance?: unknown;
};

/** Parse literals in the pinned tooling process, without evaluating app code. */
export async function extractAppManifest(source: string): Promise<AppManifest> {
  const directory = filePreviewDirectory();
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
    manifest: Partial<AppManifest> | null;
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
  if (typeof manifest.title !== 'string' || !manifest.title.trim())
    throw new ConfigurationError('The data app declaration needs a title.');
  return manifest as AppManifest;
}

export function filePreviewDirectory(): string {
  return join(configDir(), 'data-app-dev', recommendedDataAppVersion());
}
