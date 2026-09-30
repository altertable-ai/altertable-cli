import type { EmptyStateProps } from "./ui/EmptyState.tsx";
import type {
  AppVariableValues,
  DateRangeVariable,
  VariableCollection,
} from "../core/variables.ts";
import type { DateRangeRequest } from "../core/contract.ts";
import type { DimensionVariable } from "../core/dimension.ts";
import { invariant } from "../core/invariant.ts";

export type ResolvedVariables<Variables extends VariableCollection> = {
  [Key in keyof Variables]: Variables[Key] extends DateRangeVariable
    ? DateRangeRequest
    : AppVariableValues<Variables>[Key];
};

type DateVariableKey<Variables extends VariableCollection> = {
  [Key in keyof Variables]: Variables[Key] extends DateRangeVariable ? Key : never;
}[keyof Variables] &
  string;

export type ViewDate<Variables extends VariableCollection, Input> = {
  variable: DateVariableKey<Variables>;
  input: (input: Input) => DateRangeRequest;
};

/** Read variable values from a custom operation input; omitted keys use top-level fields. */
export type ViewBindings<Variables extends VariableCollection, Input> = Partial<{
  [Key in keyof Variables]: (input: Input) => ResolvedVariables<Variables>[Key];
}>;

export type DataViewDefinition<
  Name extends string,
  Variables extends VariableCollection,
  Input,
  Data,
> = {
  operation: Name;
  variables: Variables;
  input: (values: ResolvedVariables<Variables>) => Input;
  bindings?: ViewBindings<Variables, Input>;
  isEmpty: (data: Data) => boolean;
  empty: Pick<EmptyStateProps, "title" | "description">;
} & (
  | { date: ViewDate<Variables, Input>; describeInput?: (input: Input) => string }
  | { date?: never; describeInput: (input: Input) => string }
);

export function describeViewInput<Input>(definition: {
  variables: VariableCollection;
  bindings?: Partial<Record<string, (input: Input) => unknown>>;
  date?: { variable: string; input: (input: Input) => DateRangeRequest };
  describeInput?: (input: Input) => string;
}): (input: Input) => string {
  const date = definition.date;
  const variable = date && definition.variables[date.variable];
  invariant(
    !date || variable?.kind === "dateRange",
    "The view date must reference a date range variable.",
  );
  if (definition.describeInput) return definition.describeInput;
  invariant(date && variable, "A view needs a date binding or describeInput.");
  return (input) => {
    const period = (variable as DateRangeVariable).describeInput(date.input(input));
    const filters = Object.entries(definition.variables)
      .filter(([, variable]) => variable.kind === "dimension")
      .map(([key, filter]) => {
        const dimension = filter as DimensionVariable<any>;
        const selected = readViewBinding(definition, key, input);
        return dimension.valid(selected as never)
          ? `${dimension.label}: ${dimension.describe(selected as never)}`
          : null;
      })
      .filter(Boolean);
    return [period, ...filters].join(" · ");
  };
}

export function resolveViewInput<Variables extends VariableCollection, Input>(
  definition: {
    input: (values: ResolvedVariables<Variables>) => Input;
    date?: ViewDate<Variables, Input>;
    variables: Variables;
    bindings?: ViewBindings<Variables, Input>;
  },
  values: ResolvedVariables<Variables>,
): Input {
  const input = definition.input(values);
  if (definition.date) {
    const selected = values[definition.date.variable] as DateRangeRequest;
    const mapped = definition.date.input(input);
    invariant(
      mapped && mapped.range && "comparison" in mapped,
      "The operation input must preserve the selected date range and comparison.",
    );
    const sameRange = (a: DateRangeRequest["comparison"], b: DateRangeRequest["comparison"]) =>
      a === b || (!!a && !!b && a.start === b.start && a.end === b.end);
    invariant(
      sameRange(selected.range, mapped.range) && sameRange(selected.comparison, mapped.comparison),
      "The operation input must preserve the selected date range and comparison.",
    );
  }
  for (const [key, variable] of Object.entries(definition.variables)) {
    if (variable.kind !== "dimension") continue;
    const filter = variable as DimensionVariable<any>;
    const selected = values[key] as never;
    const mapped = readViewBinding(definition, key, input);
    invariant(
      filter.valid(mapped as never) && filter.same(selected, mapped as never),
      `The operation input must preserve the ${key} dimension selection.`,
    );
  }
  return input;
}

function readViewBinding<Input>(
  definition: { bindings?: Partial<Record<string, (input: Input) => unknown>> },
  key: string,
  input: Input,
): unknown {
  const read = definition.bindings?.[key];
  if (read) return read(input);
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}
