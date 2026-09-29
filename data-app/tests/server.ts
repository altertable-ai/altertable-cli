import starter from "../starter/src/index.html";
import view from "../starter/fixtures/view.html";
import components from "../starter/fixtures/index.html";
import { createDataHandler } from "../runtime/src/server.ts";
import { DataSourceError } from "../runtime/src/contract.ts";
import { operations } from "../starter/src/operations.ts";
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
  port: Number(process.env.DATA_APP_TEST_PORT ?? 26418),
  routes: { "/": starter, "/components": components, "/view": view },
  async fetch(request) {
    if (new URL(request.url).pathname === "/__test/state") {
      fail = (await request.text()) === "failure";
      return new Response("ok");
    }
    return handler(request);
  },
});
