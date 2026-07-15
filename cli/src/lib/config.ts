import { configGet, configSet } from "@/lib/profile-store.ts";
import {
  chmodConfigFile,
  configDir,
  configFile,
  credentialsFile,
  kvGet,
  kvSet,
  kvUnset,
} from "@/lib/config-files.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { readEnv } from "@/lib/env.ts";
import { isQueryLayout, type QueryLayout } from "@/ui/layouts/query.ts";

export { configDir, configFile, credentialsFile, kvGet, kvSet, kvUnset };
export { configGet, configSet };

export function configGetGlobal(key: string): string {
  return kvGet(configFile(), key);
}

export function configSetGlobal(key: string, value: string): void {
  kvSet(configFile(), key, value);
  chmodConfigFile(configFile());
}

function resolveAllowInsecureHttp(): boolean {
  return readEnv("ALTERTABLE_ALLOW_INSECURE_HTTP") ?? false;
}

export function resolveApiBase(profileName: string): string {
  let base = readEnv("ALTERTABLE_API_BASE") ?? "";
  if (!base) {
    base = configGet("api_base", profileName);
  }
  if (!base) {
    base = "https://api.altertable.ai";
  }
  const normalized = base.replace(/\/$/, "");
  assertAllowedApiBase(normalized, { allowInsecureHttp: resolveAllowInsecureHttp() });
  return normalized;
}

function resolveManagementApiRoot(profileName: string): string {
  let root = readEnv("ALTERTABLE_MANAGEMENT_API_BASE") ?? "";
  if (!root) {
    root = configGet("management_api_base", profileName);
  }
  if (!root) {
    root = "https://app.altertable.ai";
  }
  const normalized = root.replace(/\/$/, "");
  assertAllowedApiBase(normalized, { allowInsecureHttp: resolveAllowInsecureHttp() });
  return normalized;
}

export function resolveManagementApiBase(profileName: string): string {
  return `${resolveManagementApiRoot(profileName)}/rest/v1`;
}

export function resolveOAuthBase(profileName: string): string {
  return `${resolveManagementApiRoot(profileName)}/oauth`;
}

const QUERY_PAGER_VALUES = new Set(["auto", "always", "never"]);
const MIN_QUERY_MAX_COL_WIDTH = 8;

export function getQueryDefaultMaxColumnWidth(): number | undefined {
  const value = configGetGlobal("query_max_width");
  if (value.length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < MIN_QUERY_MAX_COL_WIDTH) {
    return undefined;
  }
  return parsed;
}

export function getQueryDefaultLayout(): QueryLayout | undefined {
  const value = configGetGlobal("query_layout");
  if (value.length === 0) {
    return undefined;
  }
  if (isQueryLayout(value)) {
    return value;
  }
  return undefined;
}

export function getQueryDefaultPager(): "auto" | "always" | "never" | undefined {
  const value = configGetGlobal("query_pager");
  if (value.length === 0) {
    return undefined;
  }
  if (QUERY_PAGER_VALUES.has(value)) {
    return value as "auto" | "always" | "never";
  }
  return undefined;
}
