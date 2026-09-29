import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import { copyProcessEnv } from "@/lib/env.ts";

export type AppScript = "typecheck" | "lint" | "format:check" | "dev" | "build";
export type AppCommand = "install" | AppScript;

export function appDirectory(value: unknown): string {
  if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
    throw new CliError("--dir requires a directory path.");
  }
  return value === undefined ? process.cwd() : resolve(value);
}

export function assertAppOutputMode(json: boolean, agent: boolean): void {
  if (json || agent) {
    throw new CliError("App scripts stream their own output and cannot use --json or --agent.");
  }
}

export function requireAppScripts(directory: string, required: readonly AppScript[]): void {
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  } catch {
    throw new ConfigurationError(`Cannot read a valid package.json in ${directory}.`);
  }
  const scripts =
    typeof packageJson === "object" && packageJson !== null && "scripts" in packageJson
      ? packageJson.scripts
      : undefined;
  if (typeof scripts !== "object" || scripts === null) {
    throw new ConfigurationError(`Data app in ${directory} needs scripts in package.json.`);
  }
  for (const script of required) {
    if (typeof (scripts as Record<string, unknown>)[script] !== "string") {
      throw new ConfigurationError(
        `Data app in ${directory} needs a "${script}" script in package.json.`,
      );
    }
  }
}

export async function runAppCommand(
  command: AppCommand,
  directory: string,
  appEnvironment?: Record<string, string>,
  signal?: AbortSignal,
): Promise<number> {
  const env = copyProcessEnv();
  for (const key of Object.keys(env)) {
    if (key.startsWith("ALTERTABLE_")) delete env[key];
  }
  Object.assign(env, appEnvironment);
  // Native CLI executables contain Bun. This makes the executable run Bun's
  // command and supports `bun` calls inside the project's scripts.
  env.BUN_BE_BUN = "1";

  const arguments_ = command === "install" ? ["install"] : ["run", command];
  const child = Bun.spawn([process.execPath, ...arguments_], {
    cwd: directory,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  function interrupt(): void {
    child.kill("SIGINT");
  }
  function terminate(): void {
    child.kill("SIGTERM");
  }
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted) terminate();
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
    signal?.removeEventListener("abort", terminate);
  }
}
