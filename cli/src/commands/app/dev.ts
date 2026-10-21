import { resolve } from 'node:path';

import { startAppDevProxy } from '@/commands/app/lib/dev-proxy.ts';
import { prepareFilePreview } from '@/commands/app/lib/file-dev.ts';
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from '@/commands/app/lib/run.ts';
import { checkAppScope } from '@/commands/app/lib/scope.ts';
import { defineCommand } from '@/lib/command.ts';
import { CliError, EXIT_GENERIC } from '@/lib/errors.ts';

export const appDevCommand = defineCommand({
  metadata: {
    name: 'dev',
    description:
      'Preview a local data app directory, or a single-file data app, with lakehouse access.',
    examples: [
      'altertable app dev',
      'altertable app dev --port 3022',
      'altertable --profile staging app dev --dir ./my-app',
      'altertable app dev --file ./index.tsx',
    ],
  },
  args: {
    dir: {
      type: 'string',
      description: 'App directory (default: current directory).',
    },
    file: {
      type: 'string',
      description:
        'Path to a single-file React data app (index.tsx) to preview instead of --dir. Queries are declared in the file via defineDataApp.',
      completion: 'file',
    },
    port: {
      type: 'string',
      description:
        'Local dev server port (1–65535; default: app setting, or 25837 for --file).',
    },
  },
  async run({ args, execution, runtime }) {
    assertAppOutputMode(runtime.context.json, runtime.context.agent);
    const file =
      args.file === undefined ? undefined : appFile(args.file, args.dir);
    const port = appPort(args.port) ?? (file ? '25837' : undefined);
    const directory = file
      ? await prepareFilePreview(file, execution.profile)
      : appDirectory(args.dir);
    requireAppScripts(directory, ['dev']);
    if (!file) await checkAppScope(directory, execution.profile);
    if (!file && (await runAppCommand('install', directory)) !== 0) {
      return { exitCode: EXIT_GENERIC };
    }
    const proxy = startAppDevProxy(execution);
    try {
      const environment = {
        ...proxy.environment,
        ...(file ? { ALTERTABLE_APP_FILE: file } : {}),
        ...(port ? { PORT: port } : {}),
      };
      const exitCode = await runAppCommand('dev', directory, environment);
      return { exitCode: exitCode === 0 ? 0 : EXIT_GENERIC };
    } finally {
      await proxy.stop();
    }
  },
});

function appFile(file: unknown, dir: unknown): string {
  if (dir !== undefined) throw new CliError('Pass either --dir or --file.');
  if (typeof file !== 'string' || file.length === 0) {
    throw new CliError('--file requires a file path.');
  }
  return resolve(file);
}

function appPort(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,4}$/.test(value) ||
    Number(value) > 65535
  ) {
    throw new CliError('--port must be an integer from 1 to 65535.');
  }
  return value;
}
