import type { EmptyStateProps } from "./ui/EmptyState.tsx";
import type {
  AppVariableValues,
  DateRangeVariable,
  VariableCollection,
} from "../core/variables.ts";
import type { DateRangeRequest } from "../core/contract.ts";

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
  if (date && variable?.kind !== "dateRange")
    throw new Error("The view date must reference a date range variable.");
  if (definition.describeInput) return definition.describeInput;
  if (!date || !variable) throw new Error("A view needs a date binding or describeInput.");
  return (input) => (variable as DateRangeVariable).describeInput(date.input(input));
}

export function resolveViewInput<Variables extends VariableCollection, Input>(
  definition: {
    input: (values: ResolvedVariables<Variables>) => Input;
    date?: ViewDate<Variables, Input>;
  },
  values: ResolvedVariables<Variables>,
): Input {
  const input = definition.input(values);
  if (definition.date) {
    const selected = values[definition.date.variable] as DateRangeRequest;
    const mapped = definition.date.input(input);
    const sameRange = (a: DateRangeRequest["comparison"], b: DateRangeRequest["comparison"]) =>
      a === null || b === null ? a === b : a.start === b.start && a.end === b.end;
    if (
      !sameRange(selected.range, mapped.range) ||
      !sameRange(selected.comparison, mapped.comparison)
    )
      throw new Error("The operation input must preserve the selected date range and comparison.");
  }
  return input;
}
