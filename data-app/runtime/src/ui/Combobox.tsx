import { useState } from "react";
import { Button, ComboBox, Input, ListBox, ListBoxItem, Popover } from "react-aria-components";
import { AppIcon } from "./icons.ts";
import { SearchMatch } from "./SearchMatch.tsx";
import { searchItems } from "./searchItems.ts";
import "./Combobox.css";

export type ComboboxOption = { id: string; label: string; description?: string };
export type ComboboxProps = {
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
};

export function Combobox({
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
}: ComboboxProps) {
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
