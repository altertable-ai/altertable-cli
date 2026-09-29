import type {
  DimensionMember,
  DimensionOption,
  DimensionSelection,
  DimensionValue,
  DimensionVariable,
} from "../../core/dimension.ts";
import { dimensionMemberKey } from "../../core/dimension.ts";
import { invariant } from "../../core/invariant.ts";
import { Combobox, type ComboboxOption } from "./Combobox.tsx";

const allKey = "all";

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
    const id = dimensionMemberKey(member);
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
    const id = dimensionMemberKey(member);
    byKey.set(id, member);
  }
  const missingOption = filter.allowMissing
    ? {
        id: dimensionMemberKey({ kind: "missing" }),
        label: "No value",
        description: `Records without a ${filter.label.toLocaleLowerCase()} value`,
      }
    : undefined;

  if (filter.selection === "single") {
    return (
      <Combobox
        label={filter.label}
        value={members.length ? dimensionMemberKey(members[0]!) : allKey}
        onChange={(id: string) => {
          if (id === allKey) return onChange({ kind: "all" });
          const member = byKey.get(id);
          invariant(member, `Unknown ${filter.label} option.`);
          onChange({ kind: "include", members: [member] });
        }}
        options={[{ id: allKey, label: "All" }, ...choices]}
        missingOption={missingOption}
        resetValue={allKey}
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
      values={members.map(dimensionMemberKey)}
      onChange={(ids: string[]) => {
        if (!ids.length) return onChange({ kind: "all" });
        const selected = ids.map((id) => {
          const member = byKey.get(id);
          invariant(member, `Unknown ${filter.label} option.`);
          return member;
        });
        onChange({ kind: "include", members: selected });
      }}
      options={choices}
      missingOption={missingOption}
      maxSelected={filter.maxSelected}
      loading={loading}
      error={error}
      onRetry={onRetry}
    />
  );
}
