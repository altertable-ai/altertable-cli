import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getCliContext } from "@/context.ts";
import {
  ensureProfilesLayout,
  profileConfigFile,
  readProfileConfig,
  resolveProfileName,
  unsetProfileConfig,
  writeProfileConfig,
} from "@/lib/profile.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";

const PROFILE_SCOPED_KEYS = new Set([
  "user",
  "api_key_env",
  "api_base",
  "management_api_base",
  "organization_slug",
  "organization_name",
  "principal_type",
  "principal_name",
  "principal_email",
  "principal_slug",
  "description",
  "created_at",
  "updated_at",
  "last_verified_at",
  "oauth_expiry",
  "lakehouse_credential_expiry",
]);

function isProfileScopedKey(key: string): boolean {
  return PROFILE_SCOPED_KEYS.has(key);
}

function resolveConfigProfile(override?: string): string {
  return resolveProfileName(override ?? getCliContext().profile ?? process.env.ALTERTABLE_PROFILE);
}

function trim(value: string): string {
  return value.trim();
}

export function configDir(): string {
  const override = process.env.ALTERTABLE_CONFIG_HOME;
  if (override) {
    return override;
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? "", ".config");
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
  const tmpPath = join(tmpdir(), `altertable-kv-${randomBytes(8).toString("hex")}`);
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
}

export function kvUnset(filePath: string, key: string): void {
  try {
    const lines = readFileSync(filePath, "utf8").split("\n");
    const tmpPath = join(tmpdir(), `altertable-kv-${randomBytes(8).toString("hex")}`);
    const output: string[] = [];
    for (const line of lines) {
      const eqIndex = line.indexOf("=");
      const lineKey = eqIndex === -1 ? trim(line) : trim(line.slice(0, eqIndex));
      if (lineKey === key) {
        continue;
      }
      output.push(line);
    }
    writeFileSync(tmpPath, output.join("\n"), { mode: 0o600 });
    renameSync(tmpPath, filePath);
  } catch {
    // file does not exist
  }
}

export function configGet(key: string): string {
  ensureProfilesLayout();
  if (isProfileScopedKey(key)) {
    return readProfileConfig(resolveConfigProfile(), key);
  }
  return kvGet(configFile(), key);
}

export function configSet(key: string, value: string): void {
  ensureProfilesLayout();
  if (isProfileScopedKey(key)) {
    writeProfileConfig(resolveConfigProfile(), key, value);
    try {
      chmodSync(profileConfigFile(resolveConfigProfile()), 0o600);
    } catch {
      // best effort
    }
    return;
  }

  const filePath = configFile();
  kvSet(filePath, key, value);
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // best effort
  }
}

export function configUnset(key: string): void {
  ensureProfilesLayout();
  if (isProfileScopedKey(key)) {
    unsetProfileConfig(resolveConfigProfile(), key);
    return;
  }
  kvUnset(configFile(), key);
}

function resolveAllowInsecureHttp(): boolean {
  const envFlag = process.env.ALTERTABLE_ALLOW_INSECURE_HTTP ?? "";
  return envFlag === "true" || envFlag === "1";
}

export function resolveApiBase(): string {
  let base = process.env.ALTERTABLE_API_BASE ?? "";
  if (!base) {
    base = configGet("api_base");
  }
  if (!base) {
    base = "https://api.altertable.ai";
  }
  const normalized = base.replace(/\/$/, "");
  assertAllowedApiBase(normalized, { allowInsecureHttp: resolveAllowInsecureHttp() });
  return normalized;
}

function resolveManagementApiRoot(): string {
  let root = process.env.ALTERTABLE_MANAGEMENT_API_BASE ?? "";
  if (!root) {
    root = configGet("management_api_base");
  }
  if (!root) {
    root = "https://app.altertable.ai";
  }
  const normalized = root.replace(/\/$/, "");
  assertAllowedApiBase(normalized, { allowInsecureHttp: resolveAllowInsecureHttp() });
  return normalized;
}

export function resolveManagementApiBase(): string {
  return `${resolveManagementApiRoot()}/rest/v1`;
}

export function resolveOAuthBase(): string {
  return `${resolveManagementApiRoot()}/oauth`;
}

const QUERY_LAYOUT_VALUES = new Set(["auto", "table", "line"]);
const QUERY_PAGER_VALUES = new Set(["auto", "always", "never"]);
const MIN_QUERY_MAX_COL_WIDTH = 8;

export function getQueryDefaultMaxColumnWidth(): number | undefined {
  const value = configGet("query_max_width");
  if (value.length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < MIN_QUERY_MAX_COL_WIDTH) {
    return undefined;
  }
  return parsed;
}

export function getQueryDefaultLayout(): "auto" | "table" | "line" | undefined {
  const value = configGet("query_layout");
  if (value.length === 0) {
    return undefined;
  }
  if (QUERY_LAYOUT_VALUES.has(value)) {
    return value as "auto" | "table" | "line";
  }
  return undefined;
}

export function getQueryDefaultPager(): "auto" | "always" | "never" | undefined {
  const value = configGet("query_pager");
  if (value.length === 0) {
    return undefined;
  }
  if (QUERY_PAGER_VALUES.has(value)) {
    return value as "auto" | "always" | "never";
  }
  return undefined;
}
