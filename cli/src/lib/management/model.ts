import type { components } from "@/generated/openapi-types.ts";
import { ParseError } from "@/lib/errors.ts";
import { isRecord } from "@/lib/object.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";

export type WhoamiResponse = components["schemas"]["WhoamiResponse"];

function hasRequiredString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && record[key].length > 0;
}

function hasOptionalString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || typeof record[key] === "string";
}

export function parseWhoamiResponse(body: string): WhoamiResponse {
  const data = parseApiJson(body);
  if (!isRecord(data) || !isRecord(data.principal) || !isRecord(data.organization)) {
    throw new ParseError("Management identity response has an invalid shape.", {
      details: "Expected principal and organization objects.",
    });
  }

  const principal = data.principal;
  const organization = data.organization;
  const validPrincipal =
    hasRequiredString(principal, "id") &&
    (principal.type === "User" || principal.type === "ServiceAccount") &&
    hasRequiredString(principal, "name") &&
    hasOptionalString(principal, "email") &&
    hasOptionalString(principal, "slug");
  const validOrganization =
    hasRequiredString(organization, "id") &&
    hasRequiredString(organization, "name") &&
    hasRequiredString(organization, "slug");
  const validResponse =
    validPrincipal &&
    validOrganization &&
    hasRequiredString(data, "authentication_scope") &&
    hasOptionalString(data, "environment_slug");

  if (!validResponse) {
    throw new ParseError("Management identity response has an invalid shape.", {
      details: "Response does not match the required WhoamiResponse fields.",
    });
  }
  return data as WhoamiResponse;
}

export type CatalogRow = {
  type: string;
  name: string;
  slug: string;
  engine: string;
  catalog: string;
};
