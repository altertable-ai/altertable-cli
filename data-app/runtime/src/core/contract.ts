import { parseDate, today } from "@internationalized/date";
import { formatDateRange } from "./format.ts";
import { invariant } from "./invariant.ts";

export type QueryResult = {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  queryId?: string;
};

export function parseEmptyInput(value: unknown): Record<string, never> {
  invariant(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0,
    "This operation takes no inputs.",
  );
  return {};
}

export function parseTrue(value: unknown): true {
  invariant(value === true, "Expected a successful check.");
  return true;
}

export type DateRangeInput = { start: string; end: string };
export type DateRangeRequest = { range: DateRangeInput; comparison: DateRangeInput | null };

/** The immediately preceding, equally long set of calendar days. */
export function previousDateRange({ start, end }: DateRangeInput): DateRangeInput {
  const first = parseDate(start);
  const last = parseDate(end);
  const days = (last.toDate("UTC").getTime() - first.toDate("UTC").getTime()) / 86_400_000 + 1;
  invariant(days >= 1, "Date range must start before it ends.");
  const previousEnd = first.subtract({ days: 1 });
  return {
    start: previousEnd.subtract({ days: days - 1 }).toString(),
    end: previousEnd.toString(),
  };
}

export type ReportingPeriod =
  | { kind: "rolling"; amount: number; unit: "hour" | "day"; end: string }
  | { kind: "calendar"; start: string; end: string; timeZone: string };

export type DateRangeContractOptions = {
  minDate?: string;
  maxDate?: string | (() => string);
  maxRangeDays: number;
  timeZone: string;
  completeDays?: boolean;
};

/** One source policy for the server parser, URL variable, and displayed reporting period. */
export function defineDateRangeContract(options: DateRangeContractOptions) {
  invariant(
    Number.isInteger(options.maxRangeDays) && options.maxRangeDays > 0,
    "Date range needs a positive maxRangeDays.",
  );
  if (options.minDate) parseDate(options.minDate);
  if (typeof options.maxDate === "string") parseDate(options.maxDate);
  today(options.timeZone);
  function bounds() {
    const latest = today(options.timeZone).subtract({
      days: options.completeDays === false ? 0 : 1,
    });
    const sourceMax = typeof options.maxDate === "function" ? options.maxDate() : options.maxDate;
    const maxDate =
      sourceMax && parseDate(sourceMax).compare(latest) < 0
        ? parseDate(sourceMax).toString()
        : latest.toString();
    return {
      minDate: options.minDate,
      maxDate,
      maxRangeDays: options.maxRangeDays,
      timeZone: options.timeZone,
    };
  }
  const period = ({ start, end }: DateRangeInput): ReportingPeriod => ({
    kind: "calendar",
    start,
    end,
    timeZone: options.timeZone,
  });
  const describeInput = (input: DateRangeInput) => `${formatDateRange(input)} ${options.timeZone}`;
  const comparison = (input: DateRangeInput): DateRangeInput | null => {
    const previous = previousDateRange(input);
    return options.minDate && previous.start < options.minDate ? null : previous;
  };
  const request = (value: unknown, compare = false): DateRangeRequest => {
    const range = parseDateRangeInput(value, bounds());
    const previous = compare ? comparison(range) : null;
    invariant(!compare || previous, "Comparison is outside available source coverage.");
    return { range, comparison: previous };
  };
  const parseRequest = (value: unknown): DateRangeRequest => {
    invariant(value && typeof value === "object", "Choose a date range.");
    const input = value as Record<string, unknown>;
    const parsed = request(input.range, input.comparison != null);
    if (input.comparison != null) {
      const supplied = parseDateRangeInput(input.comparison, bounds());
      invariant(
        supplied.start === parsed.comparison?.start && supplied.end === parsed.comparison?.end,
        "Comparison must be the preceding equal-length range.",
      );
    }
    return parsed;
  };
  return {
    request,
    parseRequest,
    bounds,
    parse: (value: unknown) => parseDateRangeInput(value, bounds()),
    period,
    comparison,
    describeInput,
    view: { period, describeInput },
  };
}

export type DateRangeContract = ReturnType<typeof defineDateRangeContract>;

/** Validate calendar dates and a bounded inclusive range on the server. */
export function parseDateRangeInput(
  value: unknown,
  { minDate, maxDate, maxRangeDays }: { minDate?: string; maxDate?: string; maxRangeDays: number },
): DateRangeInput {
  invariant(value && typeof value === "object" && !Array.isArray(value), "Choose a date range.");
  const { start, end } = value as Record<string, unknown>;
  function day(input: unknown): number {
    invariant(
      typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input),
      "Dates must be YYYY-MM-DD.",
    );
    const timestamp = Date.parse(`${input}T00:00:00Z`);
    invariant(
      Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === input,
      "Choose valid calendar dates.",
    );
    return timestamp;
  }
  const first = day(start);
  const last = day(end);
  invariant(
    Number.isInteger(maxRangeDays) && maxRangeDays > 0,
    "Maximum range days must be positive.",
  );
  invariant(
    first <= last &&
      (last - first) / 86_400_000 < maxRangeDays &&
      (minDate === undefined || first >= day(minDate)) &&
      (maxDate === undefined || last <= day(maxDate)),
    `Choose up to ${maxRangeDays} days within the available range.`,
  );
  return { start: start as string, end: end as string };
}

/** Accepts numeric strings from DuckDB; rejects negative, fractional, and unsafe integers. */
export function parseCount(value: unknown): number {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  invariant(
    Number.isSafeInteger(number) && number >= 0 && (typeof value !== "string" || !!value.trim()),
    "Invalid count in query result.",
  );
  return number;
}

export function parseLabel(value: unknown, maxLength = 100): string {
  invariant(
    typeof value === "string" && !!value && value.length <= maxLength,
    "Invalid label in query result.",
  );
  return value;
}

/** Rejects missing or duplicate columns and rows whose width differs from the column list. */
export function rowsAsRecords(
  result: QueryResult,
  requiredColumns: readonly string[],
): Record<string, unknown>[] {
  const names = result.columns.map((column) => column.name);
  invariant(
    new Set(names).size === names.length && requiredColumns.every((name) => names.includes(name)),
    "Query result columns do not match the expected shape.",
  );
  return result.rows.map((row) => {
    invariant(row.length === names.length, "Query result row has the wrong width.");
    return Object.fromEntries(names.map((name, index) => [name, row[index]]));
  });
}

/** One named statement an operation ran. Returned only when SQL disclosure is allowed. */
export type DisclosedQuery = { name: string; statement: string; queryId?: string };

export function defineQueryNames<const Names extends Record<string, string>>(names: Names): Names {
  const values = Object.values(names);
  invariant(
    values.every((name) => !!name.trim()) && new Set(values).size === values.length,
    "Query names must be nonempty and unique.",
  );
  return names;
}

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
  checks: readonly Input[];
  queryNames?: Readonly<Record<string, string>>;
  policy: {
    maxQueryRows: number;
    maxDurationMs: number;
    maxResponseBytes?: number;
    exposeSql?: boolean;
  };
};

export type OperationQuery<Names extends Readonly<Record<string, string>>> = (
  name: Names[keyof Names],
  statement: string,
  options?: { limit?: number },
) => Promise<QueryResult>;

export function defineOperation<
  Input,
  Output,
  const Names extends Readonly<Record<string, string>> = Record<string, never>,
>(
  operation: Omit<DataOperation<Input, Output>, "run" | "queryNames"> & {
    queryNames?: Names;
    run: (
      context: OperationContext & { query: OperationQuery<NoInfer<Names>> },
      input: Input,
    ) => Promise<Output>;
  },
): DataOperation<Input, Output> & { queryNames?: Names } {
  invariant(
    Array.isArray(operation.checks) &&
      operation.checks.length > 0 &&
      Number.isInteger(operation.policy.maxQueryRows) &&
      operation.policy.maxQueryRows > 0 &&
      Number.isInteger(operation.policy.maxDurationMs) &&
      operation.policy.maxDurationMs > 0 &&
      (operation.policy.maxResponseBytes === undefined ||
        (Number.isInteger(operation.policy.maxResponseBytes) &&
          operation.policy.maxResponseBytes > 0)),
    "Each data operation needs check inputs and positive row and duration limits.",
  );
  if (operation.queryNames) defineQueryNames(operation.queryNames);
  for (const input of operation.checks) operation.input(input);
  return {
    ...operation,
    run(context, input) {
      const query: OperationQuery<Names> = (name, statement, options) => {
        invariant(
          operation.queryNames && Object.values(operation.queryNames).includes(name),
          `Unknown query name: ${name}.`,
        );
        return context.lakehouse.queryAll(statement, {
          name,
          limit: options?.limit ?? operation.policy.maxQueryRows,
          signal: context.signal,
        });
      };
      return operation.run({ ...context, query }, input);
    },
  };
}

export const connectionQueryNames = defineQueryNames({ connection: "connection-check" });

/** Success requires a bounded SQL query; it does not establish access to a particular dataset. */
export function connectionCheck(): DataOperation<Record<string, never>, true> {
  return defineOperation({
    input: parseEmptyInput,
    output: parseTrue,
    checks: [{}],
    queryNames: connectionQueryNames,
    policy: { maxQueryRows: 1, maxDurationMs: 15_000, exposeSql: true },
    async run({ query }): Promise<true> {
      await query(connectionQueryNames.connection, "SELECT 1 AS connection_check");
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
    checks: readonly unknown[];
    queryNames?: Readonly<Record<string, string>>;
    policy: DataOperation<never, unknown>["policy"];
  }
>;
export {
  dimensionFilter,
  parseDimensionSelection,
  parseFacetOptions,
  dimensionPredicate,
} from "./dimension.ts";
export type {
  DimensionSelection,
  DimensionMember,
  DimensionOption,
  DimensionVariable,
  DimensionFilterOptions,
} from "./dimension.ts";
