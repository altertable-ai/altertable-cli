/** Bounded lakehouse rows, with an optional query ID for provenance. */
export type QueryResult = {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  queryId?: string;
};

/** One named statement an operation ran. Returned only when SQL disclosure is allowed. */
export type DisclosedQuery = { name: string; statement: string; queryId?: string };

export class DataSourceError extends Error {
  queryName?: string;

  constructor(
    public readonly reason:
      | "unauthorized"
      | "forbidden"
      | "rate_limited"
      | "query_rejected"
      | "unavailable",
    public readonly status?: number,
  ) {
    super(`Data source ${reason}${status ? ` (${status})` : ""}.`);
    this.name = "DataSourceError";
  }
}

/** Server-only query interface supplied by a local or hosted adapter. */
export type Lakehouse = {
  queryAll(
    statement: string,
    options: { limit: number; signal: AbortSignal; name?: string },
  ): Promise<QueryResult>;
};

export type OperationContext = { lakehouse: Lakehouse; signal: AbortSignal };

/**
 * One app-owned data operation. Parsers validate unknown browser input and the result
 * before it crosses the server/client boundary; TypeScript types alone cannot do that.
 * The app may use Zod or another schema library inside these parser functions.
 */
export type DataOperation<Input, Output> = {
  input: (value: unknown) => Input;
  output: (value: unknown) => Output;
  run: (context: OperationContext, input: Input) => Promise<Output>;
  policy: {
    maxQueryRows: number;
    maxDurationMs: number;
    maxResponseBytes?: number;
    exposeSql?: boolean;
  };
};

/** Register an app operation with explicit query row, duration, and response limits. */
export function defineOperation<Input, Output>(operation: DataOperation<Input, Output>) {
  if (
    !Number.isInteger(operation.policy.maxQueryRows) ||
    operation.policy.maxQueryRows < 1 ||
    !Number.isInteger(operation.policy.maxDurationMs) ||
    operation.policy.maxDurationMs < 1 ||
    (operation.policy.maxResponseBytes !== undefined &&
      (!Number.isInteger(operation.policy.maxResponseBytes) ||
        operation.policy.maxResponseBytes < 1))
  ) {
    throw new Error("Each data operation needs positive row and duration limits.");
  }
  return operation;
}

export type DataOperations = Record<
  string,
  {
    input: (value: unknown) => unknown;
    output: (value: unknown) => unknown;
    run: (context: OperationContext, input: never) => Promise<unknown>;
    policy: DataOperation<never, unknown>["policy"];
  }
>;
