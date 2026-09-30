import { checkAppScope } from "@/commands/app/lib/scope.ts";
import { defineCommand } from "@/lib/command.ts";
import { CliError, EXIT_GENERIC } from "@/lib/errors.ts";
import { startAppDevProxy } from "@/commands/app/lib/dev-proxy.ts";
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from "@/commands/app/lib/run.ts";

export const appDevCommand = defineCommand({
  metadata: {
    name: "dev",
    description: "Preview a data app locally with lakehouse access.",
    examples: [
      "altertable app dev",
      "altertable app dev --port 3022",
      "altertable --profile staging app dev --dir ./my-app",
    ],
  },
  args: {
    dir: { type: "string", description: "App directory (default: current directory)." },
    port: { type: "string", description: "Local dev server port (1–65535; default: app setting)." },
  },
  async run({ args, execution, runtime }) {
    assertAppOutputMode(runtime.context.json, runtime.context.agent);
    const port = appPort(args.port);
    const directory = appDirectory(args.dir);
    requireAppScripts(directory, ["dev"]);
    await checkAppScope(directory, execution.profile);
    const installExitCode = await runAppCommand("install", directory);
    if (installExitCode !== 0) return { exitCode: EXIT_GENERIC };
    const proxy = startAppDevProxy(execution);
    try {
      const environment = {
        ...proxy.environment,
        ...(port ? { PORT: port } : {}),
      };
      const exitCode = await runAppCommand("dev", directory, environment);
      return { exitCode: exitCode === 0 ? 0 : EXIT_GENERIC };
    } finally {
      await proxy.stop();
    }
  },
});

function appPort(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) {
    throw new CliError("--port must be an integer from 1 to 65535.");
  }
  return value;
}
