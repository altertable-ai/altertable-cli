import { getCliRuntime, setCliRuntime, type CliRuntime } from "@/lib/runtime.ts";

export function runWithCliRuntime<T>(runtime: CliRuntime, run: () => T): T {
  const previousRuntime = getCliRuntime();
  setCliRuntime(runtime);
  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(() => setCliRuntime(previousRuntime)) as T;
    }
    setCliRuntime(previousRuntime);
    return result;
  } catch (error) {
    setCliRuntime(previousRuntime);
    throw error;
  }
}
