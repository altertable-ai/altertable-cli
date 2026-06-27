import { resolveManagementApiRoot } from "@/lib/config.ts";
import { getManagementAuthHeader } from "@/lib/auth.ts";
import { CliError } from "@/lib/errors.ts";
import { httpSend } from "@/lib/http.ts";
import { getCliRuntime } from "@/lib/runtime.ts";

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export async function managementGraphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const session = getCliRuntime().session;
  const restBase = session?.managementApiBase;
  const root = restBase?.endsWith("/rest/v1")
    ? restBase.slice(0, -"/rest/v1".length)
    : resolveManagementApiRoot();
  const body = JSON.stringify({ query, variables });
  const response = await httpSend({
    method: "POST",
    url: `${root}/graphql`,
    authHeader: session?.managementAuthHeader ?? getManagementAuthHeader(),
    body,
    contentType: "application/json",
    authPlane: "management",
  });
  const data = JSON.parse(response) as GraphqlResponse<T>;
  if (data.errors && data.errors.length > 0) {
    const messages = data.errors.map((error) => error.message).filter(Boolean);
    throw new CliError(messages.length > 0 ? messages.join("; ") : "GraphQL request failed.");
  }
  if (!data.data) {
    throw new CliError("GraphQL response did not include data.");
  }
  return data.data;
}
