import view from "../starter/fixtures/view.html";
import components from "../starter/fixtures/index.html";
import { createDataHandler } from "@altertable/data-app/server";
import { DataSourceError, defineOperation, connectionCheck } from "@altertable/data-app/contract";
import { serveLocalApp } from "@altertable/data-app/server/bun";
import queries from "../starter/queries.json";
const operations = {
  connection: defineOperation({
    ...connectionCheck(),
    queryNames: { connection: "connection-check" },
    async run({ query }) {
      await query("connection-check", "SELECT 1 AS connection_check");
      return true;
    },
  }),
};
const port = Number(process.env.DATA_APP_TEST_PORT ?? 26418);
process.env.ALTERTABLE_DATA_PROXY_URL = `http://127.0.0.1:${port}/__test/proxy`;
process.env.ALTERTABLE_DATA_PROXY_TOKEN = "browser-fixture";
const local = await serveLocalApp({
  entrypoint: new URL("../starter/src/main.tsx", import.meta.url).pathname,
  registration: { queries, variables: [] },
  title: "Getting started",
  port: port + 1,
});
let fail = false;
const handler = createDataHandler(operations, async () => ({
  canDiscloseSql: true,
  lakehouse: {
    async queryAll(statement, options) {
      if (statement !== "SELECT 1 AS connection_check" || options.limit !== 1)
        throw new Error("Unexpected connection query");
      if (fail) throw new DataSourceError("unavailable");
      return { columns: [{ name: "connection_check" }], rows: [[1]], queryId: "test-query" };
    },
  },
}));
Bun.serve({
  hostname: "127.0.0.1",
  port,
  routes: { "/components": components, "/view": view },
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return Response.redirect(local.url.href);
    if (path === "/__test/proxy/query") {
      if (request.headers.get("authorization") !== "Bearer browser-fixture")
        return new Response("Forbidden", { status: 403 });
      const query = await request.json();
      if (query.statement !== "SELECT 1 AS connection_check" || query.limit !== 1)
        return new Response("Unexpected query", { status: 400 });
      if (fail) return new Response("Unavailable", { status: 503 });
      return new Response('{"query_id":"test-query"}\n["connection_check"]\n[1]\n');
    }
    if (new URL(request.url).pathname === "/__test/state") {
      fail = (await request.text()) === "failure";
      return new Response("ok");
    }
    return handler(request);
  },
});
