import { buildMainCommand } from "@/cli.ts";
import type { CliContext } from "@/context.ts";
import { executeCommand } from "@/lib/command-parser.ts";
import { createCliRuntime, type CliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

export type CliTestHarness = {
  runtime: CliRuntime;
  stdout: string[];
  stderr: string[];
  run(rawArgs: string[]): Promise<void>;
};

export function createCliTestHarness(
  context: CliContext = { debug: false, json: false, agent: false },
): CliTestHarness {
  const runtime = createCliRuntime(context);
  const stdout: string[] = [];
  const stderr: string[] = [];
  runtime.output.writeStderr = (line) => stderr.push(line);
  runtime.output.writeJson = (data) => stdout.push(JSON.stringify(data));
  runtime.output.writeRaw = (body) => stdout.push(body);
  runtime.output.writeHuman = (text) => stdout.push(text);
  runtime.output.writeMetadata = (lines) => stderr.push(...lines);

  return {
    runtime,
    stdout,
    stderr,
    async run(rawArgs) {
      await runWithCliRuntime(runtime, () => executeCommand(buildMainCommand(), rawArgs));
    },
  };
}

export async function runCommandWithTestRuntime(
  rawArgs: string[],
  context: CliContext = { debug: false, json: true, agent: false },
): Promise<CliTestHarness> {
  const harness = createCliTestHarness(context);
  await harness.run(rawArgs);
  return harness;
}
