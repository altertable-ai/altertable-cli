import type { CliContext } from "@/context.ts";
import { createCliRuntime, type CliRuntime } from "@/lib/runtime.ts";

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
