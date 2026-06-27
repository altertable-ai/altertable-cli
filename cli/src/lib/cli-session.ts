import type { CliContext } from "@/context.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { getLakehouseAuthHeader, getManagementAuthHeader } from "@/lib/auth.ts";
import { configGet, resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import { resolveProfileName } from "@/lib/profile.ts";

export type CliSession = {
  profile: string;
  apiBase: string;
  managementApiBase: string;
  lakehouseAuthHeader?: string;
  managementAuthHeader?: string;
  managementEnv?: string;
};

function tryAuthHeader(resolve: () => string): string | undefined {
  try {
    return resolve();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return undefined;
    }
    throw error;
  }
}

function resolveOptionalManagementEnv(): string | undefined {
  const env = process.env.ALTERTABLE_ENV ?? configGet("api_key_env");
  return env.length > 0 ? env : undefined;
}

export function createCliSession(context: CliContext): CliSession {
  const profile = resolveProfileName(context.profile ?? process.env.ALTERTABLE_ORG);

  return {
    profile,
    apiBase: resolveApiBase(),
    managementApiBase: resolveManagementApiBase(),
    lakehouseAuthHeader: tryAuthHeader(getLakehouseAuthHeader),
    managementAuthHeader: tryAuthHeader(getManagementAuthHeader),
    managementEnv: context.environment ?? resolveOptionalManagementEnv(),
  };
}
