import type { ReactNode } from "react";
import type { EmptyStateProps } from "./ui/EmptyState.tsx";
import { SearchField } from "./ui/SearchField.tsx";
import { Combobox } from "./ui/Combobox.tsx";
import { DateRangePicker } from "./ui/DateRangePicker.tsx";
import {
  dateRangeControl,
  useAppVariables,
  type AppVariableValues,
  type VariableCollection,
  type DateRangeVariable,
  type DateRangeSelection,
} from "./ui/variables.ts";
import type { DataReading, MetricReading, MetricValues } from "./reading.ts";
import type { DateRangeRequest } from "./contract.ts";

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

/** Resolves URL selections once per render. Date controls and operation inputs share that selection. */
export function useViewVariables<Variables extends VariableCollection>(definitions: Variables) {
  const variables = useAppVariables(definitions);
  const resolved = {} as ResolvedVariables<Variables>;
  const controls: ReactNode[] = [];
  for (const name of Object.keys(definitions) as (keyof Variables & string)[]) {
    const definition = definitions[name]!;
    const value = variables.values[name];
    if (definition.kind === "dateRange") {
      const selection = value as DateRangeSelection;
      resolved[name] = definition.input(selection) as ResolvedVariables<Variables>[typeof name];
      controls.push(
        <DateRangePicker
          key={name}
          {...dateRangeControl(definition, selection, (next) =>
            variables.set(name, next as AppVariableValues<Variables>[typeof name]),
          )}
        />,
      );
    } else {
      resolved[name] = value as ResolvedVariables<Variables>[typeof name];
      const binding = {
        label: definition.label ?? name,
        value: value as string,
        onChange: (next: string) =>
          variables.set(name, next as AppVariableValues<Variables>[typeof name]),
        resetValue: definition.defaultValue,
      };
      if (definition.kind === "select" && definition.options)
        controls.push(<Combobox key={name} {...binding} options={[...definition.options]} />);
      else if (definition.kind === "text") controls.push(<SearchField key={name} {...binding} />);
    }
  }
  return { ...variables, resolved, controls: controls.length ? controls : null };
}

export type DataContentHelpers<Data> = {
  select: <Value>(select: (data: Data) => Value) => DataReading<Value>;
  metric: (select: (data: Data) => MetricValues) => MetricReading;
};

export type DataContentState<Data, Input> = DataContentHelpers<Data> &
  ({ loading: true; data?: never; input?: never } | { loading: false; data: Data; input: Input });

/** Selectors run only for displayed data. Date comparisons inherit that result's input. */
export function defineDataContent<Data, Input>(
  render: (state: DataContentState<Data, Input>) => ReactNode,
  options: { date?: (input: Input) => DateRangeRequest } = {},
) {
  return {
    loading: render({
      loading: true,
      select: () => ({ loading: true }),
      metric: () => ({ loading: true }),
    }),
    children: (data: Data, input: Input) =>
      render({
        loading: false,
        data,
        input,
        select: (select) => ({ loading: false, value: select(data) }),
        metric: (select) => {
          const values = select(data);
          if (values.previous !== undefined && !options.date)
            throw new Error("Metric comparisons require a view date binding.");
          return { loading: false, value: { ...values, period: options.date?.(input) } };
        },
      }),
  };
}
