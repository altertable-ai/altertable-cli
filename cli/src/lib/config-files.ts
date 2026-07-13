import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readEnv } from "@/lib/env.ts";

function trim(value: string): string {
  return value.trim();
}

function tempSiblingPath(filePath: string): string {
  return join(dirname(filePath), `.altertable-kv-${randomBytes(8).toString("hex")}`);
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
  try {
    const content = readFileSync(filePath, "utf8");
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
  } catch {
    return "";
  }
  return "";
}

export function kvSet(filePath: string, key: string, value: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = tempSiblingPath(filePath);
  let found = false;
  let lines: string[] = [];

  try {
    lines = readFileSync(filePath, "utf8").split("\n");
  } catch {
    lines = [];
  }

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
}

export function kvUnset(filePath: string, key: string): void {
  try {
    const lines = readFileSync(filePath, "utf8").split("\n");
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
  } catch {
    // file does not exist
  }
}

export function chmodConfigFile(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // best effort
  }
}
