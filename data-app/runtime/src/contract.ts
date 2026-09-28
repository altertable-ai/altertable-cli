export type QueryResult = {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  queryId?: string;
};

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

/** Accepts numeric strings from DuckDB; rejects negative, fractional, and unsafe integers. */
export function parseCount(value: unknown): number {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 0 || (typeof value === "string" && !value.trim())) {
    throw new Error("Invalid count in query result.");
  }
  return number;
}

export function parseLabel(value: unknown, maxLength = 100): string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new Error("Invalid label in query result.");
  }
  return value;
}

/** Rejects missing or duplicate columns and rows whose width differs from the column list. */
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
 * Both parsers run on the server before results cross the JSON boundary. Schema libraries can be
 * used inside either parser.
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

/** Success requires a bounded SQL query; it does not establish access to a particular dataset. */
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
