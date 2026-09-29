import type { ReactNode } from "react";
import { SearchField } from "./ui/SearchField.tsx";
import { Combobox } from "./ui/Combobox.tsx";
import { DateRangePicker } from "./ui/DateRangePicker.tsx";
import {
  dateRangeControl,
  useAppVariables,
  type AppVariableValues,
  type VariableCollection,
  type DateRangeSelection,
} from "./ui/variables.ts";
import type { ResolvedVariables } from "./view.ts";

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
