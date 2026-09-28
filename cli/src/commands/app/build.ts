import { defineCommand } from "@/lib/command.ts";
import { EXIT_GENERIC } from "@/lib/errors.ts";
import {
  appDirectory,
  assertAppOutputMode,
  requireAppScripts,
  runAppCommand,
} from "@/commands/app/lib/run.ts";

export const appBuildCommand = defineCommand({
  metadata: {
    name: "build",
    description: "Typecheck and build a data app without Altertable credentials.",
    examples: ["altertable app build", "altertable app build --dir ./my-app"],
  },
  args: {
    dir: { type: "string", description: "App directory (default: current directory)." },
  },
  async run({ args, runtime }) {
    assertAppOutputMode(runtime.context.json, runtime.context.agent);
    const directory = appDirectory(args.dir);
    requireAppScripts(directory, ["typecheck", "build"]);
    const installExitCode = await runAppCommand("install", directory);
    if (installExitCode !== 0) return { exitCode: EXIT_GENERIC };
    const typecheckExitCode = await runAppCommand("typecheck", directory);
    if (typecheckExitCode !== 0) return { exitCode: EXIT_GENERIC };
    const exitCode = await runAppCommand("build", directory);
    return { exitCode: exitCode === 0 ? 0 : EXIT_GENERIC };
  },
});
