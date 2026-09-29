import { useEffect, useRef, useState } from "react";
import type {
  DimensionMember,
  DimensionOption,
  DimensionSelection,
  DimensionValue,
  DimensionVariable,
} from "../../core/dimension.ts";
import "./DimensionPicker.css";

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
  const [search, setSearch] = useState("");
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (disclosure.current && !disclosure.current.contains(event.target as Node))
        disclosure.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const members = value.kind === "include" ? value.members : [];
  const available = [...(suppliedOptions ?? filter.options)];
  for (const member of members) {
    if (member.kind === "value" && !available.some((option) => option.value === member.value))
      available.unshift({ value: member.value, label: String(member.value), count: 0 });
  }
  const options = available.filter((item) =>
    item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const labelFor = (member: DimensionMember<T>) =>
    member.kind === "missing"
      ? "Missing"
      : (available.find((option) => option.value === member.value)?.label ?? String(member.value));
  const description = value.kind === "all" ? "All" : value.members.map(labelFor).join(", ");
  const selected = (candidate: DimensionMember<T>) =>
    members.some(
      (member) =>
        member.kind === candidate.kind &&
        (member.kind === "missing" ||
          (candidate.kind === "value" && member.value === candidate.value)),
    );
  const limitReached = filter.selection === "multiple" && members.length >= filter.maxSelected;
  const toggle = (candidate: DimensionMember<T>) => {
    const next = selected(candidate)
      ? members.filter(
          (member) =>
            member.kind !== candidate.kind ||
            (member.kind === "value" &&
              candidate.kind === "value" &&
              member.value !== candidate.value),
        )
      : filter.selection === "single"
        ? [candidate]
        : [...members, candidate];
    onChange(next.length ? { kind: "include", members: next } : { kind: "all" });
    if (filter.selection === "single") disclosure.current!.open = false;
  };
  const clear = () => onChange({ kind: "all" });
  return (
    <div className="altertable-dimension-picker">
      <details ref={disclosure}>
        <summary aria-label={`${filter.label}: ${description}`}>
          <span>{filter.label}</span>
          <strong>{description}</strong>
        </summary>
        <div className="altertable-dimension-menu">
          <input
            type="search"
            aria-label={`Search ${filter.label.toLocaleLowerCase()}`}
            placeholder="Search values"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && disclosure.current?.open) {
                disclosure.current.open = false;
                event.stopPropagation();
              }
            }}
          />
          <fieldset className="altertable-dimension-options" aria-label={filter.label}>
            {loading && <output>Loading values…</output>}
            {error && (
              <output>
                Couldn’t load values.{" "}
                <button type="button" onClick={onRetry}>
                  Try again
                </button>
              </output>
            )}
            {options.map((option) => (
              <button
                key={`${typeof option.value}:${option.value}`}
                type="button"
                aria-label={
                  option.count === undefined
                    ? option.label
                    : `${option.label}, ${option.count} matches`
                }
                aria-pressed={selected({ kind: "value", value: option.value })}
                disabled={limitReached && !selected({ kind: "value", value: option.value })}
                onClick={() => toggle({ kind: "value", value: option.value })}
              >
                <span>{option.label}</span>
                {option.count !== undefined && <small>{option.count.toLocaleString()}</small>}
              </button>
            ))}
            {filter.allowMissing && (!search || "missing".includes(search.toLocaleLowerCase())) && (
              <button
                type="button"
                aria-label="Missing values"
                aria-pressed={selected({ kind: "missing" })}
                disabled={limitReached && !selected({ kind: "missing" })}
                onClick={() => toggle({ kind: "missing" })}
              >
                Missing
              </button>
            )}
            {!loading &&
              !error &&
              !options.length &&
              !(
                filter.allowMissing &&
                (!search || "missing".includes(search.toLocaleLowerCase()))
              ) && <output>No matching values</output>}
          </fieldset>
          {limitReached && <small>Select up to {filter.maxSelected} values.</small>}
          {value.kind !== "all" && (
            <button
              type="button"
              className="altertable-dimension-clear"
              aria-label={`Clear ${filter.label.toLocaleLowerCase()} filter`}
              onClick={clear}
            >
              Clear filter
            </button>
          )}
        </div>
      </details>
      {value.kind === "include" && (
        <div
          className="altertable-dimension-chips"
          aria-label={`Selected ${filter.label.toLocaleLowerCase()}`}
        >
          {value.members.map((member) => (
            <button
              key={member.kind === "missing" ? "missing" : `${typeof member.value}:${member.value}`}
              type="button"
              aria-label={`Remove ${labelFor(member)}`}
              onClick={() => toggle(member)}
            >
              {labelFor(member)} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
