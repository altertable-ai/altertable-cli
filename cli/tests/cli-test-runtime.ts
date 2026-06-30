import { runCommand } from "citty";
import { buildMainCommand } from "@/cli.ts";
import type { CliContext } from "@/context.ts";
import { createCliRuntime, runWithCliRuntime, type CliRuntime } from "@/lib/runtime.ts";

export function createCliTestRuntime(
  context: CliContext = { debug: false, json: true, agent: false },
): CliRuntime {
  const runtime = createCliRuntime(context);
  runtime.output.writeStderr = () => {};
  runtime.output.writeJson = () => {};
  runtime.output.writeRaw = () => {};
  runtime.output.writeHuman = () => {};
  runtime.output.writeMetadata = () => {};
  return runtime;
}

export async function runCommandWithTestRuntime(rawArgs: string[]): Promise<void> {
  await runWithCliRuntime(createCliTestRuntime(), () =>
    runCommand(buildMainCommand(), { rawArgs }),
  );
}
