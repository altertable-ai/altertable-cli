import { DataSourceError, type Lakehouse, type QueryResult } from "./contract.ts";
import type { DataOperations } from "./contract.ts";
import { createDataHandler } from "./server.ts";

/** Serve one app on localhost through the CLI's lakehouse proxy during development.
 * Hosted servers must authorize every viewer and must use `createDataHandler` directly. */
export function serveLocalApp({
  page,
  operations,
  title,
  port = Number(process.env.PORT ?? 25837),
}: {
  page: Bun.HTMLBundle;
  operations: DataOperations;
  title: string;
  port?: number;
}) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    development: process.env.NODE_ENV !== "production",
    idleTimeout: 60,
    routes: { "/": page },
    fetch: createDataHandler(operations, async () => ({
      lakehouse: localLakehouse(),
      canDiscloseSql: true,
    })),
  });
  console.log(`${title} running at ${server.url}`);
  return server;
}

/** Server-only lakehouse adapter. Local development uses the selected CLI profile's proxy. */
export function localLakehouse(
  environment: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Lakehouse {
  return {
    async queryAll(statement, { limit, signal }) {
      const proxyUrl = environment.ALTERTABLE_DATA_PROXY_URL;
      const proxyToken = environment.ALTERTABLE_DATA_PROXY_TOKEN;
      const username = environment.ALTERTABLE_LAKEHOUSE_USERNAME;
      const password = environment.ALTERTABLE_LAKEHOUSE_PASSWORD;
      if (!proxyUrl && (!username || !password)) throw new DataSourceError("unauthorized");
      if (proxyUrl && !proxyToken) throw new DataSourceError("unauthorized");
      const base = proxyUrl ?? environment.ALTERTABLE_API_BASE ?? "https://api.altertable.ai";
      let response: Response;
      try {
        response = await request(new URL("query", `${base.replace(/\/$/, "")}/`), {
          method: "POST",
          headers: {
            authorization: proxyUrl
              ? `Bearer ${proxyToken}`
              : `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ statement, limit }),
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new DataSourceError("unavailable");
      }
      if (!response.ok) {
        const reason =
          response.status === 401
            ? "unauthorized"
            : response.status === 403
              ? "forbidden"
              : response.status === 429
                ? "rate_limited"
                : response.status === 400 || response.status === 422
                  ? "query_rejected"
                  : "unavailable";
        throw new DataSourceError(reason, response.status);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Query response is empty.");
      const decoder = new TextDecoder();
      let body = "";
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 5_000_000) {
          await reader.cancel();
          throw new Error("Query response is too large.");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      const lines = body
        .trimEnd()
        .split("\n")
        .filter((line) => line.trim());
      if (!lines.length) throw new Error("Query response is empty.");
      const metadata = JSON.parse(lines[0]!) as { query_id?: string };
      let next = 1;
      let columns: QueryResult["columns"] = [];
      if (lines[next]) {
        const second = JSON.parse(lines[next]!) as unknown;
        if (
          Array.isArray(second) &&
          second.every(
            (value) =>
              typeof value === "string" ||
              (typeof value === "object" && value !== null && "name" in value),
          )
        ) {
          columns = second.map((value) =>
            typeof value === "string"
              ? { name: value }
              : (value as { name: string; type?: string }),
          );
          next++;
        }
      }
      const rows = lines.slice(next).map((line) => JSON.parse(line) as unknown[]);
      if (rows.length > limit) throw new Error("Lakehouse returned more rows than requested.");
      return { columns, rows, queryId: metadata.query_id };
    },
  };
}
