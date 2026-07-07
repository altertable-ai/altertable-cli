import type { CliContext } from "@/context.ts";
import { getLakehouseAuthHeader, getManagementAuthHeader } from "@/lib/auth.ts";
import { resolveApiBase, resolveManagementApiBase } from "@/lib/config.ts";
import type { AuthPlane } from "@/lib/errors.ts";
import type { CliRuntime, OutputSink } from "@/lib/runtime.ts";

export type PlaneEndpoints = {
  lakehouse: string;
  management: string;
};

export type PlaneAuthHeaders = {
  lakehouse?: string;
  management?: string;
};

export type ExecutionContext = {
  cli: CliContext;
  output: OutputSink;
  profile?: string;
  endpoints: PlaneEndpoints;
  auth: PlaneAuthHeaders;
  managementEnv?: string;
};

const PLANE_AUTH_RESOLVERS = {
  lakehouse: getLakehouseAuthHeader,
  management: getManagementAuthHeader,
} satisfies Record<AuthPlane, () => string>;

export function optionalAuth(resolve: () => string): string | undefined {
  try {
    return resolve();
  } catch (error) {
    if (error instanceof Error && error.name === "ConfigurationError") {
      return undefined;
    }
    throw error;
  }
}

export function createExecutionContext(runtime: CliRuntime): ExecutionContext {
  return {
    cli: runtime.context,
    output: runtime.output,
    profile: runtime.session?.profile,
    endpoints: {
      lakehouse: runtime.session?.apiBase ?? resolveApiBase(),
      management: runtime.session?.managementApiBase ?? resolveManagementApiBase(),
    },
    auth: {
      lakehouse: runtime.session?.lakehouseAuthHeader ?? optionalAuth(getLakehouseAuthHeader),
      management: runtime.session?.managementAuthHeader ?? optionalAuth(getManagementAuthHeader),
    },
    managementEnv: runtime.session?.managementEnv,
  };
}

export function requirePlaneAuth(context: ExecutionContext, plane: AuthPlane): string {
  return context.auth[plane] ?? PLANE_AUTH_RESOLVERS[plane]();
}
