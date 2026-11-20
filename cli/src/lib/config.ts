import {
  configDir,
  configFile,
  credentialsFile,
  kvGet,
  kvSet,
  kvUnset,
} from '@/lib/config-files.ts';
import { readEnv } from '@/lib/env.ts';
import { configGet, configSet } from '@/lib/profile-store.ts';
import { assertAllowedApiBase } from '@/lib/url-policy.ts';
import { isQueryLayout, type QueryLayout } from '@/ui/layouts/query.ts';

export { configDir, configFile, credentialsFile, kvGet, kvSet, kvUnset };
export { configGet, configSet };

export function configGetGlobal(key: string): string {
  return kvGet(configFile(), key);
}

function resolveAllowInsecureHttp(): boolean {
  return readEnv('ALTERTABLE_ALLOW_INSECURE_HTTP') ?? false;
}

export function resolveApiBase(profileName: string): string {
  let base = readEnv('ALTERTABLE_API_BASE') ?? '';
  if (!base) {
    base = configGet('api_base', profileName);
  }
  if (!base) {
    base = 'https://api.altertable.ai';
  }
  const normalized = base.replace(/\/$/, '');
  assertAllowedApiBase(normalized, {
    allowInsecureHttp: resolveAllowInsecureHttp(),
  });
  return normalized;
}

export function resolveManagementApiRoot(profileName: string): string {
  let root = readEnv('ALTERTABLE_MANAGEMENT_API_BASE') ?? '';
  if (!root) {
    root = configGet('management_api_base', profileName);
  }
  if (!root) {
    root = 'https://app.altertable.ai';
  }
  const normalized = root.replace(/\/$/, '');
  assertAllowedApiBase(normalized, {
    allowInsecureHttp: resolveAllowInsecureHttp(),
  });
  return normalized;
}

export function resolveManagementApiBase(profileName: string): string {
  return `${resolveManagementApiRoot(profileName)}/rest/v1`;
}

export function resolveOAuthBase(profileName: string): string {
  return `${resolveManagementApiRoot(profileName)}/oauth`;
}

const QUERY_PAGER_VALUES = new Set(['auto', 'always', 'never']);
export const MIN_QUERY_MAX_COLUMN_WIDTH = 8;

export function parseQueryMaxColumnWidth(value: string): number | undefined {
  const width = Number(value);
  return /^\d+$/.test(value) &&
    Number.isSafeInteger(width) &&
    width >= MIN_QUERY_MAX_COLUMN_WIDTH
    ? width
    : undefined;
}

export function getQueryDefaultMaxColumnWidth(): number | undefined {
  return parseQueryMaxColumnWidth(configGetGlobal('query_max_width'));
}

export function getQueryDefaultLayout(): QueryLayout | undefined {
  const value = configGetGlobal('query_layout');
  if (value.length === 0) {
    return undefined;
  }
  if (isQueryLayout(value)) {
    return value;
  }
  return undefined;
}

export function getQueryDefaultPager():
  | 'auto'
  | 'always'
  | 'never'
  | undefined {
  const value = configGetGlobal('query_pager');
  if (value.length === 0) {
    return undefined;
  }
  if (QUERY_PAGER_VALUES.has(value)) {
    return value as 'auto' | 'always' | 'never';
  }
  return undefined;
}
