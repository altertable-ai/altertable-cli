import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readEnv } from "@/lib/env.ts";
import { ConfigurationError } from "@/lib/errors.ts";

function tempSiblingPath(filePath: string): string {
  return join(dirname(filePath), `.altertable-kv-${randomBytes(8).toString("hex")}`);
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function configFileError(action: string, filePath: string, cause: unknown): ConfigurationError {
  return new ConfigurationError(`Unable to ${action} configuration file: ${filePath}`, { cause });
}

function configKey(line: string): string {
  const separatorIndex = line.indexOf("=");
  return line.slice(0, separatorIndex === -1 ? undefined : separatorIndex).trim();
}

function readConfigFileIfPresent(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw configFileError("read", filePath, error);
  }
}

function writeConfigFileAtomically(filePath: string, content: string, action: string): void {
  const temporaryPath = tempSiblingPath(filePath);
  let failure: unknown;
  try {
    writeFileSync(temporaryPath, content, { mode: 0o600 });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    failure = error;
  }
  try {
    rmSync(temporaryPath, { force: true });
  } catch (error) {
    failure ??= error;
  }
  if (failure !== undefined) {
    throw configFileError(action, filePath, failure);
  }
}

export function configDir(): string {
  const override = readEnv("ALTERTABLE_CONFIG_HOME");
  if (override) {
    return override;
  }
  const xdg = readEnv("XDG_CONFIG_HOME") ?? join(readEnv("HOME") ?? "", ".config");
  return join(xdg, "altertable");
}

export function configFile(): string {
  return join(configDir(), "config");
}

export function credentialsFile(): string {
  return join(configDir(), "credentials");
}

export function kvGet(filePath: string, key: string): string {
  const content = readConfigFileIfPresent(filePath);
  if (content === undefined) {
    return "";
  }
  for (const line of content.split("\n")) {
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const lineKey = line.slice(0, eqIndex).trim();
    if (lineKey === key) {
      return line.slice(eqIndex + 1).trim();
    }
  }
  return "";
}

export function kvSet(filePath: string, key: string, value: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch (error) {
    throw configFileError("write", filePath, error);
  }

  const lines = readConfigFileIfPresent(filePath)?.split("\n") ?? [];
  let found = false;
  const output = lines
    .filter((line) => line !== "" || lines.length > 1)
    .map((line) => {
      if (configKey(line) !== key) {
        return line;
      }
      found = true;
      return `${key}=${value}`;
    });
  if (!found) {
    output.push(`${key}=${value}`);
  }

  while (output.at(-1) === "") {
    output.pop();
  }
  writeConfigFileAtomically(filePath, `${output.join("\n")}\n`, "write");
}

export function kvUnset(filePath: string, key: string): void {
  const content = readConfigFileIfPresent(filePath);
  if (content === undefined) {
    return;
  }

  const output = content
    .split("\n")
    .filter((line) => configKey(line) !== key)
    .join("\n");
  writeConfigFileAtomically(filePath, output, "update");
}
