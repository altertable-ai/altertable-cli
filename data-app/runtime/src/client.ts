import type { DataOperations, DisclosedQuery } from "./contract.ts";

export type InputOf<T> = T extends { input: (value: unknown) => infer Input } ? Input : never;
export type OutputOf<T> = T extends { output: (value: unknown) => infer Output } ? Output : never;

/** Parsed operation data and query evidence. `queries` is present only when SQL disclosure is allowed. */
export type DataResponse<Output, Input = unknown> = {
  data: Output;
  /** The exact browser input that produced this response. Never infer it from current controls. */
  input: Input;
  requestId: string;
  queriedAt: string;
  queryIds: string[];
  queries?: DisclosedQuery[];
};

export class DataAppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "DataAppError";
  }
}

/** Typed browser API. The generated server runs app parsers before sending results. */
export type DataClient<Operations extends DataOperations> = {
  query<Name extends keyof Operations & string>(
    name: Name,
    input: InputOf<Operations[Name]>,
    options?: { signal?: AbortSignal },
  ): Promise<DataResponse<OutputOf<Operations[Name]>, InputOf<Operations[Name]>>>;
};

/** Browser client for named operations; it sends inputs, never SQL or lakehouse credentials. */
export function createDataClient<Operations extends DataOperations>(
  options: {
    endpoint?: string;
    fetch?: typeof fetch;
  } = {},
): DataClient<Operations> {
  const endpoint = (options.endpoint ?? "/api/data").replace(/\/$/, "");
  const request = options.fetch ?? globalThis.fetch;
  return {
    async query(name, input, { signal } = {}) {
      const response = await request(`${endpoint}/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal,
      });
      let body: Omit<DataResponse<OutputOf<Operations[typeof name]>>, "input"> & {
        error?: { code: string; message: string; requestId?: string };
      };
      try {
        const parsed: unknown = await response.json();
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Invalid response envelope.");
        body = parsed as typeof body;
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new DataAppError(
          response.ok ? "The data response was invalid." : "Could not load data.",
          response.ok ? "invalid_response" : "request_failed",
        );
      }
      if (!response.ok)
        throw new DataAppError(
          body.error?.message ?? "Could not load data.",
          body.error?.code ?? "request_failed",
          body.error?.requestId,
        );
      return { ...body, input };
    },
  };
}
