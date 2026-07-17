import { DEFAULT_CONNECT_TIMEOUT_MS } from "@/lib/transport-defaults.ts";
import { getCliRuntime, isCliRuntimeReady, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import {
  getBootstrapCliContextState,
  isJsonOutput as contextUsesJsonOutput,
  setBootstrapCliContext,
  type CliContext,
} from "@/lib/cli-context.ts";

export type { CliContext } from "@/lib/cli-context.ts";

export function isJsonOutput(context: CliContext = getCliContext()): boolean {
  return contextUsesJsonOutput(context);
}

export function setCliContext(context: CliContext): void {
  setBootstrapCliContext(context);
  if (isCliRuntimeReady()) {
    refreshCliRuntimeContext(context);
  }
}

export function getCliContext(): CliContext {
  return getCliRuntime().context;
}

export function getBootstrapCliContext(): CliContext {
  if (isCliRuntimeReady()) {
    return getCliRuntime().context;
  }
  return getBootstrapCliContextState();
}

export function getConnectTimeoutMs(): number {
  return getCliContext().connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
}
