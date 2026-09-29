import type {
  DimensionMember,
  DimensionOption,
  DimensionSelection,
  DimensionValue,
  DimensionVariable,
} from "../../core/dimension.ts";
import { Combobox, type ComboboxOption } from "./Combobox.tsx";

const allKey = JSON.stringify([]);
const memberKey = (member: DimensionMember) =>
  JSON.stringify(member.kind === "missing" ? ["m"] : ["v", member.value]);

/** Adapts the typed dimension contract to the shared Combobox control. */
export function DimensionPicker<T extends DimensionValue>({
  filter,
  value,
  onChange,
  options: suppliedOptions,
  loading = false,
  error = false,
  onRetry,
}: {
  filter: DimensionVariable<T>;
  value: DimensionSelection<T>;
  onChange: (value: DimensionSelection<T>) => void;
  options?: readonly DimensionOption<T>[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const members = value.kind === "include" ? value.members : [];
  const available = [...(suppliedOptions ?? filter.options)];
  for (const member of members)
    if (member.kind === "value" && !available.some((option) => option.value === member.value))
      available.unshift({ value: member.value, label: String(member.value), count: 0 });

  const byKey = new Map<string, DimensionMember<T>>();
  const choices: ComboboxOption[] = available.map((option) => {
    const member = { kind: "value" as const, value: option.value };
    const id = memberKey(member);
    byKey.set(id, member);
    return {
      id,
      label: option.label,
      description:
        option.count === undefined ? undefined : `${option.count.toLocaleString()} matches`,
    };
  });
  if (filter.allowMissing) {
    const member = { kind: "missing" as const };
    const id = memberKey(member);
    byKey.set(id, member);
    choices.push({ id, label: "Missing" });
  }

  if (filter.selection === "single") {
    return (
      <Combobox
        label={filter.label}
        value={members.length ? memberKey(members[0]!) : allKey}
        onChange={(id: string) =>
          onChange(id === allKey ? { kind: "all" } : { kind: "include", members: [byKey.get(id)!] })
        }
        options={[{ id: allKey, label: "All" }, ...choices]}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyMessage={error ? "Couldn’t load values" : "No matching values"}
      />
    );
  }

  return (
    <Combobox
      label={filter.label}
      values={members.map(memberKey)}
      onChange={(ids: string[]) =>
        onChange(
          ids.length
            ? { kind: "include", members: ids.map((id) => byKey.get(id)!) }
            : { kind: "all" },
        )
      }
      options={choices}
      maxSelected={filter.maxSelected}
      loading={loading}
      error={error}
      onRetry={onRetry}
    />
  );
}
