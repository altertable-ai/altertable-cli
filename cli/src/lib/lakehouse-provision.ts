import type { components } from "@/generated/openapi-types.ts";
import {
  basicAuthHeader,
  basicAuthToken,
  getManagementAuthHeader,
  hasLakehouseEnvCredentials,
  requireManagementEnv,
} from "@/lib/auth.ts";
import { configGet, configSet } from "@/lib/config.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { optionalAuth, type ExecutionContext } from "@/lib/execution-context.ts";
import { httpSend } from "@/lib/http.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { ensureFreshAccessToken, hasOAuthSession } from "@/lib/oauth-profile.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { secretSet } from "@/lib/secrets.ts";
import { terminalMuted } from "@/lib/terminal-style.ts";
import { USER_AGENT } from "@/version.ts";

const CREDENTIAL_LABEL = USER_AGENT;
const CREDENTIAL_TTL_MS = 2 * 60 * 60 * 1000;

export function hasManagementCredentials(): boolean {
  // optionalAuth only swallows ConfigurationError ("not configured");
  // real failures (e.g. keychain errors) propagate to the user.
  return optionalAuth(getManagementAuthHeader) !== undefined;
}

/**
 * A lakehouse 401 is recoverable only when the credential in use is one we
 * provisioned (never env vars or manually configured credentials — a 401 on
 * those must surface) and management credentials exist to mint a new one.
 */
export function canRecoverLakehouseAuth(): boolean {
  return (
    !hasLakehouseEnvCredentials() &&
    configGet("lakehouse_credential_expiry") !== "" &&
    hasManagementCredentials()
  );
}

async function sendManagementRequest(
  context: ExecutionContext,
  method: string,
  endpoint: string,
  body?: string,
): Promise<unknown> {
  if (hasOAuthSession()) {
    await ensureFreshAccessToken();
  }
  const response = await httpSend({
    method,
    url: `${context.endpoints.management}${encodeManagementEndpoint(endpoint)}`,
    authHeader: getManagementAuthHeader(),
    body,
    contentType: body === undefined ? undefined : "application/json",
    authPlane: "management",
  });
  return parseApiJson(response);
}

export async function provisionLakehouseCredential(context: ExecutionContext): Promise<string> {
  context.output.writeMetadata([terminalMuted("Refreshing lakehouse credentials...")]);
  const env = context.managementEnv ?? requireManagementEnv();
  const whoami = (await sendManagementRequest(
    context,
    "GET",
    "/whoami",
  )) as components["schemas"]["WhoamiResponse"];
  const principal = whoami.principal;
  if (!principal?.id || principal.type !== "User") {
    throw new ConfigurationError(
      "Cannot auto-create lakehouse credentials for a non-user identity. Run 'altertable configure'.",
    );
  }

  const expiresAt = new Date(Date.now() + CREDENTIAL_TTL_MS).toISOString();
  const created = (await sendManagementRequest(
    context,
    "POST",
    `/users/${principal.id}/environments/${env}/credentials`,
    JSON.stringify({ label: CREDENTIAL_LABEL, expires_at: expiresAt }),
  )) as components["schemas"]["CreateCredentialResponse"];

  const username = created.credential?.username;
  const password = created.password;
  if (!username || !password) {
    throw new ConfigurationError(
      "Credential creation response was missing a username or password.",
    );
  }

  const expiryMs = Date.parse(created.credential?.expires_at ?? "");
  if (Number.isNaN(expiryMs)) {
    throw new ConfigurationError("Credential creation response was missing an expiry.");
  }

  const token = basicAuthToken(username, password);
  secretSet("lakehouse/basic-token", token);
  configSet("lakehouse_credential_expiry", String(expiryMs));
  return basicAuthHeader(token);
}
