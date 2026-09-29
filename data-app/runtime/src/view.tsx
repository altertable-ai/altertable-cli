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
import type { DateRangeRequest } from "./contract.ts";

export type ResolvedVariables<Variables extends VariableCollection> = {
  [Key in keyof Variables]: Variables[Key] extends DateRangeVariable
    ? DateRangeRequest
    : AppVariableValues<Variables>[Key];
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
  describeInput: (input: Input) => string;
  isEmpty: (data: Data) => boolean;
  empty: Pick<EmptyStateProps, "title" | "description">;
};

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

export type DataContentState<Data, Input> =
  | { loading: true; data?: never; input?: never }
  | { loading: false; data: Data; input: Input };

/** One JSX composition supplies both the initial skeleton and the displayed result. */
export function defineDataContent<Data, Input>(
  render: (state: DataContentState<Data, Input>) => ReactNode,
) {
  return {
    loading: render({ loading: true }),
    children: (data: Data, input: Input) => render({ loading: false, data, input }),
  };
}
