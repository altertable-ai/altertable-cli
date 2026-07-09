export type MockHttpResponse = {
  urlPattern: string;
  method: string;
  status?: number;
  body: string;
};

type Principal =
  | { type: "User"; name: string; email: string }
  | { type: "ServiceAccount"; name: string; slug: string };

type Organization = {
  name: string;
  slug: string;
};

export function jsonMock(
  method: string,
  urlPattern: string,
  body: unknown,
  status?: number,
): MockHttpResponse {
  return {
    urlPattern,
    method,
    ...(status === undefined ? {} : { status }),
    body: JSON.stringify(body),
  };
}

export function textMock(
  method: string,
  urlPattern: string,
  body: string,
  status?: number,
): MockHttpResponse {
  return {
    urlPattern,
    method,
    ...(status === undefined ? {} : { status }),
    body,
  };
}

export function whoamiMock(
  principal: Principal = { type: "User", name: "Jane", email: "j@x.io" },
  organization: Organization = { name: "Acme", slug: "acme" },
): MockHttpResponse[] {
  return [jsonMock("GET", "/whoami", { principal, organization })];
}

export function catalogsMock({
  databaseEngine = "altertable",
  includeCreate = true,
}: {
  databaseEngine?: string;
  includeCreate?: boolean;
} = {}): MockHttpResponse[] {
  const database = {
    name: "My Cat",
    slug: "my-cat",
    engine: databaseEngine,
    catalog: "my_cat",
  };
  const connection = {
    name: "Prod PG",
    slug: "prod-pg",
    engine: "postgres",
    catalog: "prod_pg",
  };

  return [
    ...(includeCreate ? [jsonMock("POST", "/environments/production/databases", { database })] : []),
    jsonMock("GET", "/environments/production/databases", { databases: [database] }),
    jsonMock("GET", "/environments/production/connections", { connections: [connection] }),
  ];
}
