import type { components } from "@/generated/openapi-types.ts";
import { assertRetrieved, ConfigurationError, HttpError } from "@/lib/errors.ts";
import { httpSend } from "@/lib/http.ts";
import { encodeManagementEndpoint } from "@/lib/management-endpoint.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";

export type ServiceAccountAccessMode = "ro" | "rw";

// A bare mode applies to every catalog; the map form restricts per catalog.
export type ServiceAccountScope =
  | ServiceAccountAccessMode
  | Record<string, ServiceAccountAccessMode>;

export type ServiceAccountRoleAssignment = components["schemas"]["RoleAssignment"];

// The spec leaves `service_oauth_token` optional because the endpoint only issues
// one when asked; this module always asks and rejects a response without it.
export type EnvironmentServiceAccountResponse =
  components["schemas"]["EnvironmentServiceAccountResponse"] & {
    service_oauth_token: string;
  };

type ProvisionEnvironmentServiceAccountOptions = {
  managementApiBase: string;
  accessToken: string;
  environment: string;
  label: string;
  scope?: ServiceAccountScope;
};

type EnvironmentCatalogLookupOptions = {
  managementApiBase: string;
  accessToken: string;
  environment: string;
};

type CatalogIdentity = { id?: string; slug?: string; name?: string };

export type EnvironmentCatalog = { name: string; slug: string };

export function parseServiceAccountScope(value: string): ServiceAccountScope {
  const bareMode = value.trim().toLowerCase();
  if (bareMode === "ro" || bareMode === "rw") {
    return bareMode;
  }

  const scope: Record<string, ServiceAccountAccessMode> = {};
  for (const rawEntry of value.split(",")) {
    const entry = rawEntry.trim();
    const separatorIndex = entry.lastIndexOf(":");
    if (separatorIndex === -1) {
      throw new ConfigurationError(
        `Invalid --scope entry "${entry}": expected ro, rw, catalog:ro or catalog:rw.`,
      );
    }

    const catalog = entry.slice(0, separatorIndex).trim();
    const mode = entry
      .slice(separatorIndex + 1)
      .trim()
      .toLowerCase();
    if (!catalog) {
      throw new ConfigurationError(`Invalid --scope entry "${entry}": catalog name is required.`);
    }
    if (mode !== "ro" && mode !== "rw") {
      throw new ConfigurationError(`Invalid --scope entry "${entry}": mode must be ro or rw.`);
    }
    if (scope[catalog] !== undefined) {
      throw new ConfigurationError(
        `Invalid --scope entry "${entry}": catalog "${catalog}" is duplicated.`,
      );
    }
    scope[catalog] = mode;
  }
  return scope;
}

/**
 * Re-raises an HTTP failure as a new error carrying the operation and the
 * request line, so the caught error is left untouched for anything else
 * holding it.
 */
function withServiceAccountRequestContext(error: unknown): unknown {
  if (!(error instanceof HttpError)) {
    return error;
  }
  const request = `${error.method} ${error.url}`;
  return new HttpError({
    status: error.status,
    body: error.body,
    method: error.method,
    url: error.url,
    parsedDetail: error.parsedDetail ?? request,
    detailsOverride: error.details ? `${error.details}\n${request}` : request,
    messageOverride: `Failed to create environment service account: ${error.message}`,
    exitCode: error.exitCode,
    retryAfterHeader: error.retryAfterHeader,
  });
}

export async function provisionEnvironmentServiceAccount(
  options: ProvisionEnvironmentServiceAccountOptions,
): Promise<EnvironmentServiceAccountResponse> {
  const requestBody: {
    label: string;
    with_service_oauth_token: true;
    caveats?: ServiceAccountScope;
  } = {
    label: options.label,
    with_service_oauth_token: true,
  };
  if (options.scope) {
    requestBody.caveats = options.scope;
  }

  let response: string;
  try {
    response = await httpSend({
      method: "POST",
      url: `${options.managementApiBase}${encodeManagementEndpoint(`/environments/${options.environment}/service_accounts`)}`,
      authHeader: `Authorization: Bearer ${options.accessToken}`,
      body: JSON.stringify(requestBody),
      contentType: "application/json",
      authPlane: "management",
    });
  } catch (error) {
    throw withServiceAccountRequestContext(error);
  }
  const created = parseApiJson(
    response,
  ) as components["schemas"]["EnvironmentServiceAccountResponse"];

  const token = assertRetrieved(
    created.service_oauth_token,
    "login",
    "service_account.service_oauth_token",
  );
  assertRetrieved(created.service_account?.slug, "login", "service_account.slug");

  return { ...created, service_oauth_token: token };
}

function collectCatalogs(
  target: Map<string, EnvironmentCatalog>,
  entries: CatalogIdentity[],
): void {
  for (const entry of entries) {
    if (!entry.id || (!entry.name && !entry.slug)) {
      continue;
    }
    target.set(entry.id, {
      name: entry.name ?? entry.slug ?? "",
      slug: entry.slug ?? "",
    });
  }
}

/**
 * Maps catalog ids to their names so role assignments can be reported with
 * catalog names instead of raw ids. Best effort: the service account already
 * exists by the time this runs, so a failed lookup must not fail the login.
 */
export async function fetchEnvironmentCatalogs(
  options: EnvironmentCatalogLookupOptions,
): Promise<Map<string, EnvironmentCatalog>> {
  const catalogs = new Map<string, EnvironmentCatalog>();
  for (const kind of ["databases", "connections"] as const) {
    try {
      const response = await httpSend({
        method: "GET",
        url: `${options.managementApiBase}${encodeManagementEndpoint(`/environments/${options.environment}/${kind}`)}`,
        authHeader: `Authorization: Bearer ${options.accessToken}`,
        authPlane: "management",
      });
      const parsed = parseApiJson(response) as Record<string, CatalogIdentity[] | undefined>;
      collectCatalogs(catalogs, parsed[kind] ?? []);
    } catch {
      continue;
    }
  }
  return catalogs;
}
