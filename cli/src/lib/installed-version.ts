import { VERSION } from "@/version.ts";

let installedVersionOverride: string | undefined;

export function getInstalledVersion(): string {
  return installedVersionOverride ?? VERSION;
}

export function withInstalledVersion<T>(version: string, fn: () => T): T {
  const previous = installedVersionOverride;
  installedVersionOverride = version;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        installedVersionOverride = previous;
      }) as T;
    }
    installedVersionOverride = previous;
    return result;
  } catch (error) {
    installedVersionOverride = previous;
    throw error;
  }
}
