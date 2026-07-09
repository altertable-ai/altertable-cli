import { getCliContext } from "@/context.ts";
import {
  ensureProfilesLayout,
  isProfileScopedConfigKey,
  profileConfigFile,
  readProfileConfig,
  resolveProfileName,
  unsetProfileConfig,
  writeProfileConfig,
} from "@/lib/profile-store.ts";
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
import { isQueryLayout, type QueryLayout } from "@/ui/layouts/query.ts";

export { configDir, configFile, credentialsFile, kvGet, kvSet, kvUnset };

function resolveConfigProfile(override?: string): string {
  return resolveProfileName(override ?? getCliContext().profile ?? process.env.ALTERTABLE_PROFILE);
}

export function configGet(key: string): string {
  ensureProfilesLayout();
  if (isProfileScopedConfigKey(key)) {
    return readProfileConfig(resolveConfigProfile(), key);
  }
  return kvGet(configFile(), key);
}

export function configSet(key: string, value: string): void {
  ensureProfilesLayout();
  if (isProfileScopedConfigKey(key)) {
    writeProfileConfig(resolveConfigProfile(), key, value);
    chmodConfigFile(profileConfigFile(resolveConfigProfile()));
    return;
  }

  const filePath = configFile();
  kvSet(filePath, key, value);
  chmodConfigFile(filePath);
}

export function configUnset(key: string): void {
  ensureProfilesLayout();
  if (isProfileScopedConfigKey(key)) {
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

export function getQueryDefaultLayout(): QueryLayout | undefined {
  const value = configGet("query_layout");
  if (value.length === 0) {
    return undefined;
  }
  if (isQueryLayout(value)) {
    return value;
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
