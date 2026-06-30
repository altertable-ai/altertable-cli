import { defineHttpOperation } from "@/lib/http-operation.ts";
import { buildCatalogRowsFromResponses } from "@/lib/catalog-rows.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { type WhoamiResponse } from "@/lib/management-formatters.ts";
import { type ActiveContext, withAuthenticatedIdentity } from "@/lib/active-context.ts";
import type { CatalogRow } from "@/lib/management-formatters.ts";

export type ManagementCatalogCreateInput = {
  env: string;
  name: string;
  body: string;
};

export type ManagementCatalogCreateResult = {
  response: string;
  env: string;
  fallbackName: string;
};

export const managementWhoamiOperation = defineHttpOperation<ActiveContext, ActiveContext>({
  id: "management.whoami",
  request: () => ({
    plane: "management",
    method: "GET",
    endpoint: "/whoami",
  }),
  decode: (response, _context, activeContext) =>
    withAuthenticatedIdentity(activeContext, parseApiJson(response) as WhoamiResponse),
});

export const managementCatalogCreateOperation = defineHttpOperation<
  ManagementCatalogCreateInput,
  ManagementCatalogCreateResult
>({
  id: "management.catalogs.create",
  request: (input) => ({
    plane: "management",
    method: "POST",
    endpoint: `/environments/${input.env}/databases`,
    body: input.body,
    contentType: "application/json",
  }),
  decode: (response, _context, input) => ({
    response,
    env: input.env,
    fallbackName: input.name,
  }),
});

export const managementCatalogDatabasesOperation = defineHttpOperation<string, string>({
  id: "management.catalogs.databases.list",
  request: (env) => ({
    plane: "management",
    method: "GET",
    endpoint: `/environments/${env}/databases`,
  }),
});

export const managementCatalogConnectionsOperation = defineHttpOperation<string, string>({
  id: "management.catalogs.connections.list",
  request: (env) => ({
    plane: "management",
    method: "GET",
    endpoint: `/environments/${env}/connections`,
  }),
});

export function buildManagementCatalogRows(responses: unknown[]): CatalogRow[] {
  const [databasesResponse, connectionsResponse] = responses;
  return buildCatalogRowsFromResponses(String(databasesResponse), String(connectionsResponse));
}
