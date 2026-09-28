import { useEffect, useState, useSyncExternalStore } from "react";
import { today } from "@internationalized/date";
import { availableDatePresets, type DatePresetId, type DateRange } from "./DateRangePicker.tsx";
import { subscribeSearch, writeSearch } from "./search.ts";
import type { DateRangeContract } from "../contract.ts";

type HistoryMode = "push" | "replace";

/** An app-owned value with one URL representation. Controls never parse or write routes. */
export type AppVariable<Value> = {
  kind: "text" | "select" | "dateRange";
  urlKeys: readonly string[];
  defaultValue: Value;
  history: HistoryMode;
  read: (params: URLSearchParams) => Value;
  write: (value: Value) => Record<string, string | null>;
  valid: (value: Value) => boolean;
  same: (left: Value, right: Value) => boolean;
};

type VariableCollection = Record<string, AppVariable<string> | DateRangeVariable>;
export type AppVariableValues<Variables> = {
  [Key in keyof Variables]: Variables[Key] extends AppVariable<infer Value> ? Value : never;
};

/** Name variables once in the app. URL keys must be unique across its controls. */
export function defineAppVariables<const Variables extends VariableCollection>(
  variables: Variables,
): Variables {
  const owners = new Map<string, string>();
  for (const [name, variable] of Object.entries(variables)) {
    for (const key of variable.urlKeys) {
      if (!key || owners.has(key))
        throw new Error(`Variable ${name} has an empty or duplicate URL key: ${key}.`);
      owners.set(key, name);
    }
  }
  return variables;
}

type ScalarVariableOptions = { key: string; defaultValue?: string; history?: HistoryMode };

/** A local text filter. Typing replaces the current history entry by default. */
export function textVariable({
  key,
  defaultValue = "",
  history = "replace",
}: ScalarVariableOptions): AppVariable<string> {
  return {
    kind: "text",
    urlKeys: [key],
    defaultValue,
    history,
    read: (params) => params.get(key) ?? defaultValue,
    write: (value) => ({ [key]: value === defaultValue ? null : value }),
    valid: (value) => typeof value === "string",
    same: (left, right) => left === right,
  };
}

/** A single choice. Supply values when the option set is known before data loads. */
export function selectVariable({
  key,
  defaultValue,
  values,
  history = "push",
}: ScalarVariableOptions & {
  defaultValue: string;
  values?: readonly string[];
}): AppVariable<string> {
  if (values && !values.includes(defaultValue))
    throw new Error(`Select variable ${key} must include its default value.`);
  const valid = (value: string) => typeof value === "string" && (!values || values.includes(value));
  return {
    kind: "select",
    urlKeys: [key],
    defaultValue,
    history,
    read: (params) => {
      const value = params.get(key);
      return value !== null && valid(value) ? value : defaultValue;
    },
    write: (value) => ({ [key]: value === defaultValue ? null : value }),
    valid,
    same: (left, right) => left === right,
  };
}

export type DateRangeSelection =
  | { kind: "preset"; id: DatePresetId }
  | { kind: "dates"; start: string; end: string };

export type DateRangeVariableOptions = {
  /** URL key for a relative preset; explicit dates use startKey and endKey. */
  key: string;
  startKey?: string;
  endKey?: string;
  defaultValue: DateRangeSelection;
  contract: DateRangeContract;
  history?: HistoryMode;
};

export type DateRangeVariable = AppVariable<DateRangeSelection> & {
  kind: "dateRange";
  bounds: () => { minDate?: string; maxDate: string; maxRangeDays: number; timeZone: string };
  resolve: (selection: DateRangeSelection) => DateRange;
};

const PRESET_IDS = new Set<DatePresetId>([
  "day",
  "last-3",
  "last-7",
  "last-14",
  "last-30",
  "last-90",
  "this-week",
  "previous-week",
  "this-month",
  "previous-month",
]);

/** A date variable keeps relative presets relative and validates exact dates against source coverage. */
export function dateRangeVariable({
  key,
  startKey = "start",
  endKey = "end",
  defaultValue,
  contract,
  history = "push",
}: DateRangeVariableOptions): DateRangeVariable {
  const bounds = contract.bounds;
  function resolve(selection: DateRangeSelection): DateRange {
    const limits = bounds();
    if (selection.kind === "preset") {
      const preset = availableDatePresets(limits).find((item) => item.id === selection.id);
      if (preset) return preset.range;
    } else {
      try {
        return contract.parse(selection);
      } catch {
        // Invalid URL values fall back to the app default.
      }
    }
    throw new Error(`Date variable ${key} is outside its available data range.`);
  }
  const same = (left: DateRangeSelection, right: DateRangeSelection) =>
    left.kind === right.kind &&
    (left.kind === "preset" && right.kind === "preset"
      ? left.id === right.id
      : left.kind === "dates" &&
        right.kind === "dates" &&
        left.start === right.start &&
        left.end === right.end);
  const variable: DateRangeVariable = {
    kind: "dateRange",
    urlKeys: [key, startKey, endKey],
    defaultValue,
    history,
    bounds,
    resolve,
    same,
    valid: (value) => {
      try {
        resolve(value);
        return true;
      } catch {
        return false;
      }
    },
    read: (params) => {
      const presetId = params.get(key);
      if (presetId && PRESET_IDS.has(presetId as DatePresetId)) {
        const selection = { kind: "preset", id: presetId as DatePresetId } as const;
        if (variable.valid(selection)) return selection;
      }
      const start = params.get(startKey);
      const end = params.get(endKey);
      if (start && end) {
        const selection = { kind: "dates", start, end } as const;
        if (variable.valid(selection)) return selection;
      }
      return defaultValue;
    },
    write: (value) =>
      same(value, defaultValue)
        ? { [key]: null, [startKey]: null, [endKey]: null }
        : value.kind === "preset"
          ? { [key]: value.id, [startKey]: null, [endKey]: null }
          : { [key]: null, [startKey]: value.start, [endKey]: value.end },
  };
  if (!variable.valid(defaultValue))
    throw new Error(`Date variable ${key} has a default outside its available data range.`);
  return variable;
}

/** Adapt one date variable to the controlled picker without giving the picker URL ownership. */
export function dateRangeControl(
  variable: DateRangeVariable,
  selection: DateRangeSelection,
  onChange: (selection: DateRangeSelection) => void,
) {
  const value = variable.resolve(selection);
  return {
    value,
    onChange: (range: DateRange | null) =>
      onChange(range ? { kind: "dates", ...range } : variable.defaultValue),
    onPresetChange: (id: DatePresetId) => onChange({ kind: "preset", id }),
    selectedPresetId: selection.kind === "preset" ? selection.id : null,
    onReset: () => onChange(variable.defaultValue),
    isDefault: variable.same(selection, variable.defaultValue),
    resetValue: variable.resolve(variable.defaultValue),
    ...variable.bounds(),
  };
}

const currentSearch = () => window.location.search;
const serverSearch = () => "";

/** URL is the source of truth for app variables; one update can change dependent values atomically. */
export function useAppVariables<const Variables extends VariableCollection>(
  definitions: Variables,
) {
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
      if (!variable.valid(value)) throw new Error(`Invalid value for variable ${name}.`);
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
