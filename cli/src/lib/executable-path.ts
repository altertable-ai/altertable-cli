import { accessSync, constants, realpathSync, statSync } from "node:fs";
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

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) {
      return false;
    }
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function invocationPath(value: string, cwd: string, pathValue: string): string | undefined {
  if (isAbsolute(value)) {
    return isExecutableFile(value) ? value : undefined;
  }
  if (value.includes("/") || value.includes("\\")) {
    const candidate = resolve(cwd, value);
    return isExecutableFile(candidate) ? candidate : undefined;
  }
  for (const directory of pathValue.split(delimiter)) {
    const candidate = resolve(directory || cwd, value);
    if (isExecutableFile(candidate)) {
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
  if (invokedPath) {
    return canonicalPath(invokedPath);
  }

  const resolvedExecPath = invocationPath(execPath, cwd, pathValue) ?? resolve(cwd, execPath);
  return canonicalPath(resolvedExecPath);
}
