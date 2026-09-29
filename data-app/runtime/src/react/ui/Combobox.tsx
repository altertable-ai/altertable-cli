import { useState } from "react";
import {
  Button,
  ComboBox,
  Dialog,
  DialogTrigger,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  type Selection,
} from "react-aria-components";
import { AppIcon } from "./icons.ts";
import { SearchMatch } from "./SearchMatch.tsx";
import { searchItems } from "./searchItems.ts";
import "./Combobox.css";

export type ComboboxOption = { id: string; label: string; description?: string };
export type SingleComboboxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  resetValue?: string;
  loading?: boolean;
  loadingMessage?: string;
  error?: boolean;
  onRetry?: () => void;
};
export type MultiComboboxProps = {
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  options: ComboboxOption[];
  maxSelected: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
export type ComboboxProps = SingleComboboxProps | MultiComboboxProps;

export function Combobox(props: ComboboxProps) {
  return "values" in props ? <MultiCombobox {...props} /> : <SingleCombobox {...props} />;
}

function SingleCombobox({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  emptyMessage = "No matching options",
  resetValue,
  loading = false,
  loadingMessage = "Loading options…",
  error = false,
  onRetry,
}: SingleComboboxProps) {
  const selectedLabel = options.find((option) => option.id === value)?.label ?? "";
  const [input, setInput] = useState({ selectedLabel, value: selectedLabel });
  const inputValue = input.selectedLabel === selectedLabel ? input.value : selectedLabel;
  const setInputValue = (value: string) => setInput({ selectedLabel, value });
  const search = inputValue === selectedLabel ? "" : inputValue.trim();
  const matches = searchItems(options, search, {
    attributes: [
      { name: "label", getter: (option) => option.label },
      { name: "description", getter: (option) => option.description ?? "" },
    ],
  });

  return (
    <ComboBox
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key === null) return;
        const next = String(key);
        setInputValue(options.find((option) => option.id === next)?.label ?? "");
        onChange(next);
      }}
      onInputChange={setInputValue}
      items={matches}
      onOpenChange={(open) => {
        if (!open) setInputValue(selectedLabel);
      }}
      allowsEmptyCollection
      isDisabled={disabled}
      aria-busy={loading || undefined}
      className="altertable-combobox"
    >
      <div className="altertable-combobox-control">
        <span className="altertable-combobox-label" aria-hidden="true">
          {label}
        </span>
        <Input
          className="altertable-combobox-value"
          placeholder={placeholder ?? `Search ${label.toLocaleLowerCase()}`}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
        />
        {resetValue !== undefined && value !== resetValue && (
          <button
            type="button"
            className="altertable-combobox-reset"
            aria-label={`Reset ${label.toLocaleLowerCase()}`}
            disabled={disabled}
            onClick={() => {
              setInputValue(options.find((option) => option.id === resetValue)?.label ?? "");
              onChange(resetValue);
            }}
          >
            <AppIcon name="reset" size={14} />
          </button>
        )}
        <Button aria-label={`Show ${label.toLocaleLowerCase()} options`}>
          <AppIcon name="disclosure" size={14} />
        </Button>
      </div>
      <Popover className="altertable-combobox-popover" placement="bottom start">
        <ListBox
          items={matches}
          aria-label={label}
          renderEmptyState={() => (
            <output className="altertable-combobox-empty">
              {loading ? loadingMessage : emptyMessage}
              {error && onRetry && (
                <button type="button" onClick={onRetry}>
                  Try again
                </button>
              )}
            </output>
          )}
        >
          {(hit) => (
            <ListBoxItem id={hit.item.id} textValue={hit.item.label}>
              <SearchMatch match={hit.matches.label} />
              {hit.item.description && (
                <small>
                  <SearchMatch match={hit.matches.description} />
                </small>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

function MultiCombobox({
  label,
  values,
  onChange,
  options,
  maxSelected,
  loading = false,
  error = false,
  onRetry,
}: MultiComboboxProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selected = new Set(values);
  const labels = [
    ...options.filter((option) => selected.has(option.id)).map((option) => option.label),
    ...values.filter((value) => !options.some((option) => option.id === value)),
  ];
  const matches = searchItems(options, search.trim(), {
    attributes: [{ name: "label", getter: (option) => option.label }],
  });
  const changeSelection = (selection: Selection) => {
    if (selection === "all") return;
    const next = [...selection].map(String);
    if (next.length <= maxSelected) onChange(next);
  };

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <Button
        className="altertable-combobox-control altertable-combobox-multi"
        aria-label={`${label}: ${labels.length ? labels.join(", ") : "All"}`}
      >
        <span className="altertable-combobox-label">{label}</span>
        <strong className="altertable-combobox-multi-value">
          {labels.length ? labels.join(", ") : "All"}
        </strong>
        <AppIcon name="disclosure" size={14} />
      </Button>
      <Popover
        className="altertable-combobox-popover altertable-combobox-multi-popover"
        placement="bottom start"
      >
        <Dialog aria-label={`${label} options`}>
          <Input
            aria-label={`Search ${label.toLocaleLowerCase()}`}
            className="altertable-combobox-multi-search"
            placeholder="Search values"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <ListBox
            items={matches}
            aria-label={label}
            selectionMode="multiple"
            selectionBehavior="toggle"
            selectedKeys={selected}
            onSelectionChange={changeSelection}
            renderEmptyState={() => (
              <output className="altertable-combobox-empty">
                {loading
                  ? "Loading values…"
                  : error
                    ? "Couldn’t load values"
                    : "No matching values"}
              </output>
            )}
          >
            {(hit) => (
              <ListBoxItem
                id={hit.item.id}
                textValue={hit.item.label}
                isDisabled={values.length >= maxSelected && !selected.has(hit.item.id)}
              >
                <SearchMatch match={hit.matches.label} />
                {hit.item.description && <small>{hit.item.description}</small>}
              </ListBoxItem>
            )}
          </ListBox>
          <div className="altertable-combobox-multi-actions">
            {values.length > 0 && <Button onPress={() => onChange([])}>Clear filter</Button>}
            {error && <Button onPress={onRetry}>Try again</Button>}
            {values.length >= maxSelected && <small>Select up to {maxSelected} values.</small>}
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
