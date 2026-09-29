import {
  DataSourceError,
  type DataOperations,
  type DisclosedQuery,
  type Lakehouse,
} from "./contract.ts";

/** Authorization result for one viewer request. A hosted adapter must scope its lakehouse client. */
export type RequestAccess = { lakehouse: Lakehouse; canDiscloseSql: boolean };

/**
 * Execute named operations on the server. The app supplies operations and viewer authorization.
 * JSON, Origin, and Fetch Metadata checks reject cross-site browser POSTs; they do not
 * authenticate another local process. SQL is returned only when both the operation and
 * authorization result permit disclosure.
 */
export function createDataHandler(
  operations: DataOperations,
  authorize: (request: Request, operation: string) => Promise<RequestAccess>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/data/")) return new Response("Not found", { status: 404 });
    const encodedName = url.pathname.slice("/api/data/".length);
    if (!encodedName || encodedName.includes("/"))
      return problem(404, "not_found", "Unknown data operation.", requestId);
    let name: string;
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      return problem(404, "not_found", "Unknown data operation.", requestId);
    }
    if (!Object.hasOwn(operations, name))
      return problem(404, "not_found", "Unknown data operation.", requestId);
    if (request.method !== "POST")
      return problem(405, "method_not_allowed", "Use POST.", requestId);
    if (
      request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return problem(415, "unsupported_media_type", "Use application/json.", requestId);
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    const fetchMode = request.headers.get("sec-fetch-mode");
    if (
      (origin !== null && origin !== url.origin) ||
      (fetchSite !== null && fetchSite !== "same-origin") ||
      (fetchSite !== null && origin === null) ||
      (fetchMode !== null && fetchMode !== "cors" && fetchMode !== "same-origin")
    )
      return problem(
        403,
        "cross_origin_request",
        "The data request must come from this app.",
        requestId,
      );
    let access: RequestAccess;
    try {
      access = await authorize(request, name);
    } catch {
      return problem(403, "forbidden", "You cannot run this data operation.", requestId);
    }
    const operation = operations[name]!;
    let input: unknown;
    try {
      const body = await request.text();
      if (body.length > 16_384)
        return problem(413, "input_too_large", "Input is too large.", requestId);
      input = operation.input(JSON.parse(body));
    } catch {
      return problem(400, "invalid_input", "Check this operation's inputs.", requestId);
    }
    const timeout = AbortSignal.timeout(operation.policy.maxDurationMs);
    const signal = AbortSignal.any([request.signal, timeout]);
    const queryIds: string[] = [];
    const queries: DisclosedQuery[] = [];
    const boundedLakehouse: Lakehouse = {
      async queryAll(statement, options) {
        if (!Number.isInteger(options.limit) || options.limit < 1)
          throw new Error("Query needs a positive row limit.");
        if (
          operation.queryNames &&
          !Object.values(operation.queryNames).includes(options.name ?? "")
        )
          throw new Error(`Query name is not registered for operation ${name}.`);
        const query: DisclosedQuery = {
          name: options.name ?? `Query ${queries.length + 1}`,
          statement,
        };
        queries.push(query);
        let result;
        try {
          result = await access.lakehouse.queryAll(statement, {
            limit: Math.min(options.limit, operation.policy.maxQueryRows),
            signal: AbortSignal.any([signal, options.signal]),
          });
        } catch (error) {
          if (error instanceof DataSourceError) error.queryName = query.name;
          throw error;
        }
        if (result.rows.length > operation.policy.maxQueryRows)
          throw new Error("Result exceeds row limit.");
        if (result.queryId) {
          query.queryId = result.queryId;
          queryIds.push(result.queryId);
        }
        return result;
      },
    };
    try {
      const data = operation.output(
        await Promise.race([
          operation.run({ lakehouse: boundedLakehouse, signal }, input as never),
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(new Error("Request aborted.")), {
              once: true,
            }),
          ),
        ]),
      );
      const result = {
        data,
        requestId,
        queriedAt: new Date().toISOString(),
        queryIds,
        ...(operation.policy.exposeSql && access.canDiscloseSql ? { queries } : {}),
      };
      const body = JSON.stringify(result);
      if (
        new TextEncoder().encode(body).byteLength > (operation.policy.maxResponseBytes ?? 1_000_000)
      ) {
        throw new Error("Response exceeds byte limit.");
      }
      return new Response(body, {
        headers: { "cache-control": "no-store", "content-type": "application/json" },
      });
    } catch (error) {
      const source = error instanceof DataSourceError ? error : null;
      console.error(
        `Data operation ${name} failed (${requestId}): ${source ? `${source.reason}${source.status ? ` (${source.status})` : ""}${source.queryName ? ` in ${source.queryName}` : ""}` : error instanceof Error ? error.name : "unknown"}`,
      );
      if (source) {
        const messages = {
          unauthorized:
            "Lakehouse access needs attention. Run this app with 'altertable app dev', or run 'altertable login' and retry.",
          forbidden:
            "This app cannot access its lakehouse data. Check the selected profile's permissions.",
          rate_limited: "The lakehouse is busy. Wait a moment and retry.",
          query_rejected: "A lakehouse query was rejected. Check the app's data operation.",
          unavailable: "The lakehouse is unavailable. Check the connection and retry.",
        };
        return problem(
          source.reason === "rate_limited" ? 429 : 502,
          `source_${source.reason}`,
          messages[source.reason],
          requestId,
        );
      }
      return problem(
        signal.aborted ? 504 : 502,
        signal.aborted ? "timeout" : "query_failed",
        signal.aborted ? "The data request timed out." : "The data request failed.",
        requestId,
      );
    }
  };
}

function problem(status: number, code: string, message: string, requestId: string): Response {
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
