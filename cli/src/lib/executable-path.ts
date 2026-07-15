import { existsSync, realpathSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";

export type ExecutablePathOptions = {
  execPath?: string;
  argv0?: string;
  cwd?: string;
  path?: string;
};

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function invocationPath(value: string, cwd: string, pathValue: string): string | undefined {
  if (isAbsolute(value)) {
    return value;
  }
  if (value.includes("/") || value.includes("\\")) {
    return resolve(cwd, value);
  }
  for (const directory of pathValue.split(delimiter)) {
    const candidate = resolve(directory || cwd, value);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/** Resolve the file that should be replaced when a compiled CLI updates itself. */
export function resolveProcessExecutablePath(options: ExecutablePathOptions = {}): string {
  const usesCurrentProcess = options.execPath === undefined;
  const execPath = options.execPath ?? process.execPath;
  const argv0 = options.argv0 ?? (usesCurrentProcess ? process.argv0 : execPath);
  const cwd = options.cwd ?? process.cwd();
  const pathValue = options.path ?? "";

  if (isAbsolute(execPath)) {
    return canonicalPath(execPath);
  }

  const invokedPath = invocationPath(argv0, cwd, pathValue);
  if (invokedPath && existsSync(invokedPath)) {
    return canonicalPath(invokedPath);
  }

  const resolvedExecPath = invocationPath(execPath, cwd, pathValue) ?? resolve(cwd, execPath);
  return canonicalPath(resolvedExecPath);
}
