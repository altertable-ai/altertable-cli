import { DEFAULT_CONNECT_TIMEOUT_MS } from "@/lib/transport-defaults.ts";
import { getCliRuntime, isCliRuntimeReady, refreshCliRuntimeContext } from "@/lib/runtime.ts";

export type CliContext = {
  debug: boolean;
  json: boolean;
  profile?: string;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
};

const PRE_RUNTIME_DEFAULT_CONTEXT: CliContext = { debug: false, json: false };

let preRuntimeContext: CliContext = PRE_RUNTIME_DEFAULT_CONTEXT;

export function setCliContext(context: CliContext): void {
  preRuntimeContext = context;
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
  return preRuntimeContext;
}

export function getConnectTimeoutMs(): number {
  return getCliContext().connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
}
