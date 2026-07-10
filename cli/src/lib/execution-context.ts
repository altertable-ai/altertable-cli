import type { CliContext } from "@/context.ts";
import { resolveWorkingProfile } from "@/lib/profile-store.ts";
import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";

export type ExecutionContext = {
  cli: CliContext;
  output: OutputSink;
  profile: string;
};

export function optionalAuth(resolve: () => string): string | undefined {
  try {
    return resolve();
  } catch (error) {
    if (error instanceof Error && error.name === "ConfigurationError") {
      return undefined;
    }
    throw error;
  }
}

export function createExecutionContext(runtime: CliRuntime): ExecutionContext {
  return {
    cli: runtime.context,
    output: runtime.output,
    profile: runtime.session?.profile ?? resolveWorkingProfile(runtime.context.profile),
  };
}
