import { getCliContext } from "@/context.ts";

export function logDebug(message: string): void {
  if (getCliContext().debug) {
    console.error(`[DEBUG] ${message}`);
  }
}

export function logWarn(message: string): void {
  console.error(`[WARN] ${message}`);
}
