import type { AppVariable, HistoryMode } from "./variables.ts";
import { invariant } from "./invariant.ts";

export type DimensionValue = string | number;
export type DimensionMember<T extends DimensionValue = DimensionValue> =
  | { kind: "value"; value: T }
  | { kind: "missing" };
export type DimensionSelection<T extends DimensionValue = DimensionValue> =
  | { kind: "all" }
  | { kind: "include"; members: readonly DimensionMember<T>[] };
export type DimensionOption<T extends DimensionValue = DimensionValue> = {
  value: T;
  label: string;
  count?: number;
};
export type DimensionVariable<T extends DimensionValue = DimensionValue> = Omit<
  AppVariable<DimensionSelection<T>, "dimension">,
  "options"
> & {
  label: string;
  selection: "single" | "multiple";
  valueType: "string" | "number";
  allowMissing: boolean;
  maxSelected: number;
  options: readonly DimensionOption<T>[];
  facet?: { operation: string; input: (values: Record<string, unknown>) => unknown };
  describe: (selection: DimensionSelection<T>) => string;
};

const allSelection: DimensionSelection<never> = { kind: "all" };
export const dimensionMemberKey = (member: DimensionMember) =>
  member.kind === "missing" ? "missing" : `value:${typeof member.value}:${member.value}`;

export type DimensionFilterOptions<T extends DimensionValue> = {
  key: string;
  label: string;
  valueType: T extends number ? "number" : "string";
  selection: "single" | "multiple";
  allowMissing?: boolean;
  maxSelected?: number;
  history?: HistoryMode;
} & (
  | { options: readonly DimensionOption<T>[]; facet?: never }
  | {
      /** A bounded operation supplies options and counts; input chooses other filters affecting counts. */
      facet: { operation: string; input: (values: Record<string, unknown>) => unknown };
      options?: never;
    }
);

/** A bounded categorical filter. URL tags distinguish missing from literal "null". */
export function dimensionFilter<const T extends DimensionValue>(
  config: DimensionFilterOptions<T>,
): DimensionVariable<T> {
  const { key, label, selection, valueType } = config;
  const options = config.options ?? [];
  invariant(!!config.options !== !!config.facet, "Choose fixed options or one facet operation.");
  const optionKeys = options.map((option) =>
    dimensionMemberKey({ kind: "value", value: option.value }),
  );
  invariant(
    !!key && options.length <= 200 && new Set(optionKeys).size === options.length,
    "Dimension options need a key, at most 200 distinct values.",
  );
  invariant(
    options.every(
      (option) =>
        typeof option.value === valueType &&
        !!option.label.trim() &&
        (option.count === undefined || (Number.isSafeInteger(option.count) && option.count >= 0)),
    ),
    "Dimension options need typed values, labels, and nonnegative counts.",
  );
  const allowed = new Set(optionKeys);
  const maxSelected = config.maxSelected ?? (selection === "single" ? 1 : 20);
  invariant(
    Number.isInteger(maxSelected) &&
      maxSelected >= 1 &&
      maxSelected <= 50 &&
      (selection !== "single" || maxSelected === 1),
    "Dimension selection limit is invalid.",
  );
  const allowMissing = config.allowMissing ?? false;
  const defaultValue = allSelection;
  function validMember(member: DimensionMember<T>): boolean {
    if (member.kind === "missing") return allowMissing;
    if (member.kind !== "value" || typeof member.value !== valueType) return false;
    if (!config.facet) return allowed.has(dimensionMemberKey(member));
    return typeof member.value === "number"
      ? Number.isFinite(member.value)
      : member.value.length <= 100;
  }
  function valid(value: DimensionSelection<T>): boolean {
    if (!value || typeof value !== "object") return false;
    if (value.kind === "all") return true;
    if (
      value.kind !== "include" ||
      !Array.isArray(value.members) ||
      !value.members.length ||
      value.members.length > maxSelected
    )
      return false;
    const ids = value.members.map(dimensionMemberKey);
    return new Set(ids).size === ids.length && value.members.every(validMember);
  }
  const encode = (value: DimensionSelection<T>) =>
    value.kind === "all"
      ? null
      : JSON.stringify(
          value.members.map((member) => (member.kind === "missing" ? ["m"] : ["v", member.value])),
        );
  const parse = (raw: string | null): DimensionSelection<T> => {
    if (raw === null) return defaultValue;
    if (raw.length > 4096) return defaultValue;
    try {
      const tokens = JSON.parse(raw);
      if (!Array.isArray(tokens)) return defaultValue;
      const value = {
        kind: "include" as const,
        members: tokens.map((token) =>
          Array.isArray(token) && token.length === 1 && token[0] === "m"
            ? { kind: "missing" as const }
            : Array.isArray(token) && token.length === 2 && token[0] === "v"
              ? { kind: "value" as const, value: token[1] as T }
              : { kind: "invalid" as const },
        ),
      };
      return valid(value as DimensionSelection<T>)
        ? (value as DimensionSelection<T>)
        : defaultValue;
    } catch {
      return defaultValue;
    }
  };
  return {
    kind: "dimension",
    label,
    valueType,
    selection,
    options,
    facet: config.facet,
    allowMissing,
    maxSelected,
    urlKeys: [key],
    defaultValue,
    history: config.history ?? "push",
    valid,
    same: (left, right) => encode(left) === encode(right),
    read: (params) => parse(params.get(key)),
    write: (value) => ({ [key]: encode(value) }),
    describe: (value) =>
      value.kind === "all"
        ? `All ${label.toLocaleLowerCase()}`
        : value.members
            .map((member) =>
              member.kind === "missing"
                ? "Missing"
                : (options.find((option) => option.value === member.value)?.label ??
                  String(member.value)),
            )
            .join(", "),
  };
}

/** Server-side parser; call from the operation input parser before building SQL. */
export function parseDimensionSelection<T extends DimensionValue>(
  value: unknown,
  filter: DimensionVariable<T>,
): DimensionSelection<T> {
  invariant(filter.valid(value as DimensionSelection<T>), `Invalid ${filter.label} selection.`);
  return value as DimensionSelection<T>;
}

/** Validate bounded facet results before showing them in a picker. */
export function parseFacetOptions<T extends DimensionValue>(
  value: unknown,
  filter: DimensionVariable<T>,
): DimensionOption<T>[] {
  invariant(Array.isArray(value) && value.length <= 200, "Facet options exceed their bound.");
  const options: DimensionOption<T>[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    invariant(item && typeof item === "object", "Invalid facet option.");
    const option = item as DimensionOption<T>;
    invariant(
      typeof option.value === filter.valueType &&
        filter.valid({ kind: "include", members: [{ kind: "value", value: option.value }] }) &&
        typeof option.label === "string" &&
        !!option.label.trim() &&
        option.label.length <= 100 &&
        (option.count === undefined || (Number.isSafeInteger(option.count) && option.count >= 0)),
      "Invalid facet option.",
    );
    const id = dimensionMemberKey({ kind: "value", value: option.value });
    invariant(!seen.has(id), "Duplicate facet option.");
    seen.add(id);
    options.push(option);
  }
  return options;
}

/** Central SQL literal encoding for transports without bound parameters. Column is an allowlisted identifier. */
export function dimensionPredicate<
  T extends DimensionValue,
  const Columns extends readonly string[],
>(column: Columns[number], selection: DimensionSelection<T>, allowedColumns: Columns): string {
  invariant(
    allowedColumns.includes(column) &&
      /^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*$/.test(column),
    "Invalid dimension column.",
  );
  if (selection.kind === "all") return "";
  invariant(selection.members.length > 0, "Empty dimension inclusion is invalid.");
  const values = selection.members.filter(
    (member): member is Extract<DimensionMember<T>, { kind: "value" }> => member.kind === "value",
  );
  const missing = selection.members.some((member) => member.kind === "missing");
  const literals = values.map(({ value }) => {
    if (typeof value === "number") {
      invariant(Number.isFinite(value), "Invalid numeric dimension value.");
      return String(value);
    }
    const text = value as string;
    for (let index = 0; index < text.length; index++)
      invariant(
        text.charCodeAt(index) >= 32 && text.charCodeAt(index) !== 127,
        "Invalid control character in dimension value.",
      );
    return `'${text.replaceAll("'", "''")}'`;
  });
  const clauses = [
    ...(literals.length ? [`${column} IN (${literals.join(", ")})`] : []),
    ...(missing ? [`${column} IS NULL`] : []),
  ];
  return `(${clauses.join(" OR ")})`;
}
