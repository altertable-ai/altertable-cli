import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readEnv } from "@/lib/env.ts";
import { ConfigurationError } from "@/lib/errors.ts";

function trim(value: string): string {
  return value.trim();
}

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
    const lineKey = trim(line.slice(0, eqIndex));
    if (lineKey === key) {
      return trim(line.slice(eqIndex + 1));
    }
  }
  return "";
}

export function kvSet(filePath: string, key: string, value: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmpPath = tempSiblingPath(filePath);
    let found = false;
    const lines = readConfigFileIfPresent(filePath)?.split("\n") ?? [];

    const output: string[] = [];
    for (const line of lines) {
      if (line === "" && output.length === 0 && lines.length === 1) {
        continue;
      }
      const eqIndex = line.indexOf("=");
      const lineKey = eqIndex === -1 ? trim(line) : trim(line.slice(0, eqIndex));
      if (lineKey === key) {
        output.push(`${key}=${value}`);
        found = true;
      } else {
        output.push(line);
      }
    }

    if (!found) {
      output.push(`${key}=${value}`);
    }

    try {
      writeFileSync(
        tmpPath,
        output
          .filter((line, index, array) => {
            if (index === array.length - 1 && line === "") {
              return false;
            }
            return true;
          })
          .join("\n") + (output.length > 0 ? "\n" : ""),
        { mode: 0o600 },
      );
      renameSync(tmpPath, filePath);
    } finally {
      rmSync(tmpPath, { force: true });
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw configFileError("write", filePath, error);
  }
}

export function kvUnset(filePath: string, key: string): void {
  try {
    const content = readConfigFileIfPresent(filePath);
    if (content === undefined) {
      return;
    }
    const lines = content.split("\n");
    const tmpPath = tempSiblingPath(filePath);
    const output: string[] = [];
    for (const line of lines) {
      const eqIndex = line.indexOf("=");
      const lineKey = eqIndex === -1 ? trim(line) : trim(line.slice(0, eqIndex));
      if (lineKey === key) {
        continue;
      }
      output.push(line);
    }
    try {
      writeFileSync(tmpPath, output.join("\n"), { mode: 0o600 });
      renameSync(tmpPath, filePath);
    } finally {
      rmSync(tmpPath, { force: true });
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw configFileError("update", filePath, error);
  }
}
