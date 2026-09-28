import { watch } from "node:fs";
import { defineCommand } from "@/lib/command.ts";
import { CliError, ConfigurationError, EXIT_GENERIC } from "@/lib/errors.ts";
import { startAppDevProxy } from "@/commands/app/lib/dev-proxy.ts";
import { readRuntimeSource, runtimeSourceDirectory } from "@/commands/app/lib/runtime.ts";
import { upgradeApp } from "@/commands/app/upgrade.ts";
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from "@/commands/app/lib/run.ts";

export const appDevCommand = defineCommand({
  metadata: {
    name: "dev",
    description: "Run a data app with lakehouse access.",
    examples: [
      "altertable app dev",
      "altertable app dev --port 3022",
      "altertable app dev --watch-runtime",
      "altertable --profile staging app dev --dir ./my-app",
    ],
  },
  args: {
    dir: { type: "string", description: "App directory (default: current directory)." },
    port: { type: "string", description: "Local dev server port (1–65535; default: app setting)." },
    "watch-runtime": {
      type: "boolean",
      description: "Upgrade generated runtime on source changes and restart preview.",
    },
  },
  async run({ args, execution, runtime, sink }) {
    assertAppOutputMode(runtime.context.json, runtime.context.agent);
    const port = appPort(args.port);
    const directory = appDirectory(args.dir);
    requireAppScripts(directory, ["dev"]);
    if (args["watch-runtime"]) {
      try {
        await upgradeApp(directory, { runtimeFiles: await readRuntimeSource() });
      } catch (error) {
        throw new ConfigurationError(`Runtime source watch stopped: ${errorMessage(error)}`);
      }
    }
    const installExitCode = await runAppCommand("install", directory);
    if (installExitCode !== 0) return { exitCode: EXIT_GENERIC };
    const proxy = startAppDevProxy(execution);
    try {
      const environment = {
        ...proxy.environment,
        ...(port ? { PORT: port } : {}),
      };
      const exitCode = args["watch-runtime"]
        ? await runWithRuntimeWatch(directory, environment, sink.writeHuman.bind(sink))
        : await runAppCommand("dev", directory, environment);
      return { exitCode: exitCode === 0 ? 0 : EXIT_GENERIC };
    } finally {
      await proxy.stop();
    }
  },
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runWithRuntimeWatch(
  directory: string,
  environment: Record<string, string>,
  announce: (message: string) => void,
): Promise<number> {
  let changed = false;
  let wake: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watchedRoots = new Set(
    Object.keys(await readRuntimeSource()).map((name) => name.split("/")[0]),
  );
  let watcher: ReturnType<typeof watch>;
  try {
    watcher = watch(runtimeSourceDirectory, { recursive: true }, (_, filename) => {
      if (filename && !watchedRoots.has(filename.replaceAll("\\", "/").split("/")[0])) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        changed = true;
        wake?.();
      }, 200);
    });
  } catch (error) {
    throw new ConfigurationError(
      `Cannot watch runtime source at ${runtimeSourceDirectory}: ${errorMessage(error)}`,
    );
  }
  function waitForChange(): Promise<void> {
    if (changed) {
      changed = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      wake = () => {
        wake = undefined;
        changed = false;
        resolve();
      };
    });
  }
  try {
    announce(`Watching runtime source at ${runtimeSourceDirectory}.`);
    while (true) {
      const controller = new AbortController();
      const preview = runAppCommand("dev", directory, environment, controller.signal);
      const result = await Promise.race([
        preview.then((exitCode) => ({ kind: "exit" as const, exitCode })),
        waitForChange().then(() => ({ kind: "change" as const })),
      ]);
      if (result.kind === "exit") return result.exitCode;
      controller.abort();
      await preview;
      try {
        const files = await readRuntimeSource();
        watchedRoots = new Set(Object.keys(files).map((name) => name.split("/")[0]));
        const upgraded = await upgradeApp(directory, { runtimeFiles: files });
        if (upgraded) {
          const installExitCode = await runAppCommand("install", directory);
          if (installExitCode !== 0) return installExitCode;
        }
        announce(
          upgraded
            ? "Runtime upgraded; restarting preview."
            : "Runtime source unchanged; restarting preview.",
        );
      } catch (error) {
        throw new ConfigurationError(`Runtime source watch stopped: ${errorMessage(error)}`);
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
    watcher.close();
  }
}

function appPort(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) {
    throw new CliError("--port must be an integer from 1 to 65535.");
  }
  return value;
}
