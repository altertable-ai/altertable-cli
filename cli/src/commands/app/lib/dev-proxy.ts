import { randomBytes, timingSafeEqual } from "node:crypto";
import { ConfigurationError, HttpError } from "@/lib/errors.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { sendHttpStream } from "@/lib/http-request.ts";

/** Keep profile credentials in the CLI process while a local app is running. */
export function startAppDevProxy(
  execution: ExecutionContext,
  send: typeof sendHttpStream = sendHttpStream,
) {
  const token = randomBytes(32).toString("hex");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 60,
    async fetch(request) {
      const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const valid =
        supplied.length === token.length &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
      if (!valid) return new Response("Unauthorized", { status: 401 });
      if (request.method !== "POST" || new URL(request.url).pathname !== "/query") {
        return new Response("Not found", { status: 404 });
      }
      const body = await request.text();
      if (body.length > 100_000) return new Response("Query too large", { status: 413 });
      try {
        const stream = await send(
          {
            plane: "lakehouse",
            method: "POST",
            endpoint: "/query",
            body,
            contentType: "application/json",
          },
          execution,
        );
        return new Response(stream, {
          headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
        });
      } catch (error) {
        if (error instanceof HttpError) {
          return new Response("Lakehouse query failed", { status: error.status ?? 502 });
        }
        if (error instanceof ConfigurationError) {
          console.error(
            `Data app lakehouse access failed for profile ${execution.profile}. Run 'altertable login' or update the profile, then retry.`,
          );
          return new Response("Lakehouse access needs attention", { status: 401 });
        }
        console.error(`Data app lakehouse query failed for profile ${execution.profile}.`);
        return new Response("Lakehouse query failed", { status: 502 });
      }
    },
  });
  return {
    environment: {
      ALTERTABLE_DATA_PROXY_URL: `http://127.0.0.1:${server.port}`,
      ALTERTABLE_DATA_PROXY_TOKEN: token,
    },
    stop: () => server.stop(true),
  };
}
