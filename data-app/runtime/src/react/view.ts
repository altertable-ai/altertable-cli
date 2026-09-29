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

export type DataViewDefinition<
  Name extends string,
  Variables extends VariableCollection,
  Input,
  Data,
> = {
  operation: Name;
  variables: Variables;
  input: (values: ResolvedVariables<Variables>) => Input;
  isEmpty: (data: Data) => boolean;
  empty: Pick<EmptyStateProps, "title" | "description">;
} & (
  | { date: ViewDate<Variables, Input>; describeInput?: (input: Input) => string }
  | { date?: never; describeInput: (input: Input) => string }
);

export function describeViewInput<Input>(definition: {
  variables: VariableCollection;
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
        const selected =
          input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
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
  },
  values: ResolvedVariables<Variables>,
): Input {
  const input = definition.input(values);
  if (definition.date) {
    const selected = values[definition.date.variable] as DateRangeRequest;
    const mapped = definition.date.input(input);
    const sameRange = (a: DateRangeRequest["comparison"], b: DateRangeRequest["comparison"]) =>
      a === null || b === null ? a === b : a.start === b.start && a.end === b.end;
    invariant(
      sameRange(selected.range, mapped.range) && sameRange(selected.comparison, mapped.comparison),
      "The operation input must preserve the selected date range and comparison.",
    );
  }
  for (const [key, variable] of Object.entries(definition.variables)) {
    if (variable.kind !== "dimension") continue;
    const filter = variable as DimensionVariable<any>;
    const selected = values[key] as never;
    const mapped =
      input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
    invariant(
      filter.valid(mapped as never) && filter.same(selected, mapped as never),
      `The operation input must preserve the ${key} dimension selection.`,
    );
  }
  return input;
}
