import { expect, test } from "bun:test";
import * as runtime from "../src/server.ts";
import * as contract from "../src/contract.ts";
import * as local from "../src/local.ts";
import * as appearance from "../src/appearance.ts";
test("runtime validates input, bounds rows, and hides query failures", async () => {
  expect(appearance.parseAppearance({ density: "compact", cornerRadius: "small" })).toMatchObject({
    density: "compact",
    cornerRadius: "small",
  });
  expect(() => appearance.parseAppearance({ cornerRadius: "roundish" })).toThrow(
    "Invalid appearance",
  );
  const source = local.localLakehouse(
    { ALTERTABLE_LAKEHOUSE_USERNAME: "user", ALTERTABLE_LAKEHOUSE_PASSWORD: "secret" },
    Object.assign(async () => new Response("private upstream detail", { status: 401 }), {
      preconnect() {},
    }),
  );
  try {
    await source.queryAll("SELECT 1", { limit: 1, signal: new AbortController().signal });
    throw new Error("Expected an authorization failure.");
  } catch (error) {
    expect(error).toMatchObject({ reason: "unauthorized", status: 401 });
  }
  const proxied = local.localLakehouse(
    {
      ALTERTABLE_DATA_PROXY_URL: "http://127.0.0.1:1234",
      ALTERTABLE_DATA_PROXY_TOKEN: "run-token",
    },
    Object.assign(
      async (url: RequestInfo | URL, options?: RequestInit) => {
        expect(url instanceof Request ? url.url : url.toString()).toBe(
          "http://127.0.0.1:1234/query",
        );
        expect(options?.headers).toMatchObject({ authorization: "Bearer run-token" });
        return new Response('{"query_id":"q1"}\n["value"]\n[1]\n');
      },
      { preconnect() {} },
    ),
  );
  expect(
    await proxied.queryAll("SELECT 1", { limit: 1, signal: new AbortController().signal }),
  ).toMatchObject({ rows: [[1]], queryId: "q1" });
  const operation = contract.defineOperation({
    checks: [1],
    queryNames: contract.defineQueryNames({ totals: "totals" }),
    input(value: unknown) {
      if (value !== 1) throw new Error("Bad input");
      return 1;
    },
    output(value: unknown) {
      return value as number;
    },
    policy: { maxQueryRows: 1, maxDurationMs: 1000, exposeSql: true },
    async run({
      lakehouse,
      signal,
    }: {
      lakehouse: {
        queryAll: (
          sql: string,
          options: { limit: number; signal: AbortSignal; name?: string },
        ) => Promise<{ rows: unknown[][] }>;
      };
      signal: AbortSignal;
    }) {
      const result = await lakehouse.queryAll("SELECT 1", { limit: 20, signal, name: "totals" });
      return result.rows.length;
    },
  });
  let requestedLimit = 0;
  const handle = runtime.createDataHandler({ totals: operation }, async () => ({
    canDiscloseSql: true,
    lakehouse: {
      async queryAll(_statement: string, options: { limit: number }) {
        requestedLimit = options.limit;
        return { columns: [], rows: [[1]], queryId: "query-1" };
      },
    },
  }));
  const request = (value: unknown) =>
    new Request("http://localhost/api/data/totals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  const valid = await handle(request(1));
  expect(valid.status).toBe(200);
  const response = await valid.json();
  expect(response).not.toHaveProperty("evidence");
  expect(response).toMatchObject({
    data: 1,
    queryIds: ["query-1"],
    queries: [{ name: "totals", statement: "SELECT 1", queryId: "query-1" }],
  });
  expect(requestedLimit).toBe(1);
  const unregistered = runtime.createDataHandler(
    {
      totals: {
        ...operation,
        run: async ({ lakehouse, signal }) => {
          await lakehouse.queryAll("SELECT 1", { limit: 1, signal, name: "other" });
          return 1;
        },
      },
    },
    async () => ({
      canDiscloseSql: true,
      lakehouse: { queryAll: async () => ({ columns: [], rows: [] }) },
    }),
  );
  expect((await unregistered(request(1))).status).toBe(502);
  expect(
    (
      await handle(
        new Request("http://localhost/api/data/totals", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "1",
        }),
      )
    ).status,
  ).toBe(415);
  expect(
    (
      await handle(
        new Request("http://localhost/api/data/totals", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://other.example" },
          body: "1",
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handle(
        new Request("http://localhost/api/data/totals", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            "sec-fetch-site": "cross-site",
          },
          body: "1",
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handle(
        new Request("http://localhost/api/data/totals", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
          },
          body: "1",
        }),
      )
    ).status,
  ).toBe(200);
  const restricted = runtime.createDataHandler({ totals: operation }, async () => ({
    canDiscloseSql: false,
    lakehouse: {
      async queryAll() {
        return { columns: [], rows: [[1]] };
      },
    },
  }));
  expect(await (await restricted(request(1))).json()).not.toHaveProperty("queries");
  expect((await handle(request(2))).status).toBe(400);
  expect((await handle(new Request("http://localhost/api/data/other"))).status).toBe(404);
  const failing = runtime.createDataHandler({ totals: operation }, async () => ({
    canDiscloseSql: false,
    lakehouse: {
      async queryAll() {
        throw new Error("private upstream detail");
      },
    },
  }));
  const failure = await failing(request(1));
  expect(failure.status).toBe(502);
  expect(JSON.stringify(await failure.json())).not.toContain("private upstream detail");
  const sourceFailure = runtime.createDataHandler({ totals: operation }, async () => ({
    canDiscloseSql: false,
    lakehouse: source,
  }));
  const upstreamFailure = await sourceFailure(request(1));
  expect(upstreamFailure.status).toBe(502);
  expect(await upstreamFailure.json()).toMatchObject({
    error: { code: "source_unauthorized", message: expect.stringContaining("altertable login") },
  });
  const forbidden = runtime.createDataHandler({ totals: operation }, async () => {
    throw new Error("private authorization detail");
  });
  const denied = await forbidden(request(1));
  expect(denied.status).toBe(403);
  expect(JSON.stringify(await denied.json())).not.toContain("private authorization detail");
});
