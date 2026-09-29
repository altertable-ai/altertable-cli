import { useEffect, useState, useSyncExternalStore } from "react";
import { today } from "@internationalized/date";
import { invariant } from "../../core/invariant.ts";
import { subscribeSearch, writeSearch } from "./search.ts";
import type { DatePresetId, DateRange } from "../../core/date-range.ts";
import {
  defineAppVariables,
  type AppVariable,
  type AppVariableValues,
  type DateRangeSelection,
  type DateRangeVariable,
  type HistoryMode,
  type VariableCollection,
} from "../../core/variables.ts";
export {
  defineAppVariables,
  textVariable,
  selectVariable,
  dateRangeVariable,
} from "../../core/variables.ts";
export type {
  AppVariable,
  AppVariableValues,
  DateRangeSelection,
  DateRangeVariable,
  DateRangeVariableOptions,
  VariableCollection,
} from "../../core/variables.ts";

/** Adapt one date variable to the controlled picker without giving the picker URL ownership. */
export function dateRangeControl(
  variable: DateRangeVariable,
  selection: DateRangeSelection,
  onChange: (selection: DateRangeSelection) => void,
) {
  const value = variable.resolve(selection);
  const update = (next: DateRangeSelection) =>
    onChange(
      selection.comparison && variable.previous(next) ? { ...next, comparison: "previous" } : next,
    );
  return {
    value,
    label: variable.label,
    onChange: (range: DateRange | null) =>
      update(range ? { kind: "dates", ...range } : variable.defaultValue),
    onPresetChange: (id: DatePresetId) => update({ kind: "preset", id }),
    selectedPresetId: selection.kind === "preset" ? selection.id : null,
    onReset: () => onChange(variable.defaultValue),
    isDefault: variable.same(selection, variable.defaultValue),
    resetValue: variable.resolve(variable.defaultValue),
    ...(variable.supportsComparison
      ? {
          comparison: {
            enabled: selection.comparison === "previous",
            range: variable.previous(selection),
            onChange: (enabled: boolean) =>
              onChange(
                enabled
                  ? { ...selection, comparison: "previous" }
                  : { ...selection, comparison: undefined },
              ),
          },
        }
      : {}),
    ...variable.bounds(),
  };
}

const currentSearch = () => window.location.search;
const serverSearch = () => "";

/** URL is the source of truth for app variables; one update can change dependent values atomically. */
export function useAppVariables<const Variables extends VariableCollection>(
  definitions: Variables,
) {
  defineAppVariables(definitions);
  const search = useSyncExternalStore(subscribeSearch, currentSearch, serverSearch);
  const zones = Object.values(definitions)
    .filter((item) => item.kind === "dateRange")
    .map((item) => (item as DateRangeVariable).bounds().timeZone);
  const zoneKey = [...new Set(zones)].sort().join("|");
  const [, updateDay] = useState(0);
  useEffect(() => {
    if (!zoneKey) return;
    const timeZones = zoneKey.split("|");
    let day = timeZones.map((zone) => today(zone).toString()).join("|");
    const timer = window.setInterval(() => {
      const next = timeZones.map((zone) => today(zone).toString()).join("|");
      if (next !== day) {
        day = next;
        updateDay((value) => value + 1);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [zoneKey]);
  const params = new URLSearchParams(search);
  const values = {} as AppVariableValues<Variables>;
  const canonical: Record<string, string | null> = {};
  for (const name of Object.keys(definitions) as (keyof Variables & string)[]) {
    const variable = definitions[name] as unknown as AppVariable<
      AppVariableValues<Variables>[typeof name]
    >;
    const value = variable.read(params);
    values[name] = value;
    Object.assign(canonical, variable.write(value));
  }
  useEffect(() => {
    if (Object.entries(canonical).some(([key, value]) => params.get(key) !== value))
      writeSearch(canonical);
  });
  function update(next: Partial<AppVariableValues<Variables>>, history?: HistoryMode) {
    const changes: Record<string, string | null> = {};
    let mode: HistoryMode = history ?? "replace";
    for (const name of Object.keys(next) as (keyof Variables & string)[]) {
      const variable = definitions[name] as unknown as AppVariable<
        AppVariableValues<Variables>[typeof name]
      >;
      const value = next[name]!;
      invariant(variable.valid(value), `Invalid value for variable ${name}.`);
      Object.assign(changes, variable.write(value));
      if (!history && variable.history === "push") mode = "push";
    }
    writeSearch(changes, mode);
  }
  function set<Key extends keyof Variables & string>(
    name: Key,
    value: AppVariableValues<Variables>[Key],
  ) {
    update({ [name]: value } as Partial<AppVariableValues<Variables>>);
  }
  function reset<Key extends keyof Variables & string>(name: Key) {
    const variable = definitions[name] as unknown as AppVariable<AppVariableValues<Variables>[Key]>;
    set(name, variable.defaultValue);
  }
  function bind<Key extends keyof Variables & string>(name: Key) {
    const variable = definitions[name] as unknown as AppVariable<AppVariableValues<Variables>[Key]>;
    return {
      value: values[name],
      onChange: (value: AppVariableValues<Variables>[Key]) => set(name, value),
      resetValue: variable.defaultValue,
    };
  }
  return { values, set, reset, update, bind };
}
