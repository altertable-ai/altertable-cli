/** Bounded lakehouse rows, with an optional query ID for provenance. */
export type QueryResult = {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  queryId?: string;
};

/** Validate an operation with no reader inputs. */
export function parseEmptyInput(value: unknown): Record<string, never> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length
  ) {
    throw new Error("This operation takes no inputs.");
  }
  return {};
}

/** Validate a successful probe result after it crosses the JSON boundary. */
export function parseTrue(value: unknown): true {
  if (value !== true) throw new Error("Expected a successful check.");
  return true;
}

export type DateRangeInput = { start: string; end: string };

/** Validate complete UTC calendar dates and a bounded inclusive range on the server. */
export function parseDateRangeInput(
  value: unknown,
  { minDate, maxDate, maxRangeDays }: { minDate?: string; maxDate?: string; maxRangeDays: number },
): DateRangeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Choose a date range.");
  }
  const { start, end } = value as Record<string, unknown>;
  function day(input: unknown): number {
    if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new Error("Dates must be YYYY-MM-DD.");
    }
    const timestamp = Date.parse(`${input}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== input) {
      throw new Error("Choose valid calendar dates.");
    }
    return timestamp;
  }
  const first = day(start);
  const last = day(end);
  if (!Number.isInteger(maxRangeDays) || maxRangeDays < 1) {
    throw new Error("Maximum range days must be positive.");
  }
  if (
    first > last ||
    (last - first) / 86_400_000 >= maxRangeDays ||
    (minDate !== undefined && first < day(minDate)) ||
    (maxDate !== undefined && last > day(maxDate))
  ) {
    throw new Error(`Choose up to ${maxRangeDays} days within the available range.`);
  }
  return { start: start as string, end: end as string };
}

/** Parse a DuckDB count without accepting fractional or unsafe values. */
export function parseCount(value: unknown): number {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || (typeof value === "string" && !value.trim())) {
    throw new Error("Invalid count in query result.");
  }
  return number;
}

/** Parse a nonempty data label with an explicit maximum length. */
export function parseLabel(value: unknown, maxLength = 100): string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new Error("Invalid label in query result.");
  }
  return value;
}

/** Address query rows by named columns, with missing and duplicate columns rejected. */
export function rowsAsRecords(
  result: QueryResult,
  requiredColumns: readonly string[],
): Record<string, unknown>[] {
  const names = result.columns.map((column) => column.name);
  if (
    new Set(names).size !== names.length ||
    requiredColumns.some((name) => !names.includes(name))
  ) {
    throw new Error("Query result columns do not match the expected shape.");
  }
  return result.rows.map((row) => {
    if (row.length !== names.length) throw new Error("Query result row has the wrong width.");
    return Object.fromEntries(names.map((name, index) => [name, row[index]]));
  });
}

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

/** Starter probe: a profile is connected only after this bounded SQL request succeeds. */
export function connectionCheck(): DataOperation<Record<string, never>, true> {
  return defineOperation({
    input: parseEmptyInput,
    output: parseTrue,
    policy: { maxQueryRows: 1, maxDurationMs: 15_000, exposeSql: true },
    async run({ lakehouse, signal }): Promise<true> {
      await lakehouse.queryAll("SELECT 1 AS connection_check", {
        limit: 1,
        signal,
        name: "connection-check",
      });
      return true;
    },
  });
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
