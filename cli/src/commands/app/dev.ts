import { resolve } from "node:path";
import { defaultFilePreviewPort, previewAppFile } from "@/commands/app/lib/file-preview.ts";
import { checkAppScope } from "@/commands/app/lib/scope.ts";
import { defineCommand } from "@/lib/command.ts";
import { CliError, EXIT_GENERIC } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { runAppPreview } from "@/commands/app/lib/dev-proxy.ts";
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from "@/commands/app/lib/run.ts";

export const appDevCommand = defineCommand({
  metadata: {
    name: "dev",
    description:
      "Preview a local data app directory, or a single-file data app, with lakehouse access.",
    examples: [
      "altertable app dev",
      "altertable app dev --port 3022",
      "altertable --profile staging app dev --dir ./my-app",
      "altertable app dev --file ./index.tsx",
    ],
  },
  args: {
    dir: { type: "string", description: "App directory (default: current directory)." },
    file: {
      type: "string",
      description: "Path to a single-file React data app (index.tsx) to preview instead of --dir.",
      completion: "file",
    },
    port: {
      type: "string",
      description: `Local dev server port (1–65535; default: app setting, or ${defaultFilePreviewPort} for --file).`,
    },
  },
  async run({ args, execution, runtime }) {
    assertAppOutputMode(runtime.context.json, runtime.context.agent);
    if (args.file !== undefined && args.dir !== undefined)
      throw new CliError("Pass either --dir or --file.");
    const port = parsePreviewPort(args.port);
    if (args.file === undefined) {
      return { exitCode: await previewAppDirectory(appDirectory(args.dir), port, execution) };
    }
    return {
      exitCode: await previewAppFile(
        resolvePreviewFile(args.file),
        port ?? defaultFilePreviewPort,
        execution,
      ),
    };
  },
});

async function previewAppDirectory(
  directory: string,
  port: number | undefined,
  execution: ExecutionContext,
): Promise<number> {
  requireAppScripts(directory, ["dev"]);
  await checkAppScope(directory, execution.profile);
  const installExitCode = await runAppCommand("install", directory);
  if (installExitCode !== 0) return EXIT_GENERIC;
  return runAppPreview(
    ["run", "dev"],
    directory,
    execution,
    port === undefined ? {} : { PORT: String(port) },
  );
}

function resolvePreviewFile(file: unknown): string {
  if (typeof file !== "string" || file.length === 0) {
    throw new CliError("--file requires a file path.");
  }
  return resolve(file);
}

function parsePreviewPort(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) {
    throw new CliError("--port must be an integer from 1 to 65535.");
  }
  return Number(value);
}
