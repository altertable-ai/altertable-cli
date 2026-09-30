import { useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  type Selection,
} from "react-aria-components";
import { AppIcon } from "./icons.ts";
import { GradientScroll } from "./GradientScroll.tsx";
import { SearchMatch } from "./SearchMatch.tsx";
import { searchItems } from "./searchItems.ts";
import "./Combobox.css";

export type ComboboxOption = { id: string; label: string; description?: string };
type SharedProps = {
  label: string;
  options: ComboboxOption[];
  /** Null is a separate source state, not an ordinary category value. */
  missingOption?: ComboboxOption;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};
export type SingleComboboxProps = SharedProps & {
  value: string;
  onChange: (value: string) => void;
  resetValue?: string;
  values?: never;
  maxSelected?: never;
};
export type MultiComboboxProps = SharedProps & {
  values: readonly string[];
  onChange: (values: string[]) => void;
  maxSelected: number;
  value?: never;
  resetValue?: never;
};
export type ComboboxProps = SingleComboboxProps | MultiComboboxProps;

/** Searchable selection picker with one focus and popup model for single and multiple values. */
export function Combobox(props: ComboboxProps) {
  const multiple = "values" in props && props.values !== undefined;
  const { label, options, missingOption, disabled, loading, error, onRetry } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const statusId = useId();
  const popupId = useId();
  const chosen = multiple ? props.values : [props.value];
  const selected = new Set(chosen);
  const selectedOptions = [...options, ...(missingOption ? [missingOption] : [])];
  const labels = chosen.map(
    (id) => selectedOptions.find((option) => option.id === id)?.label ?? id,
  );
  const display = multiple ? labels.join(", ") || "All" : labels[0] || "All";
  const matches = searchItems(selectedOptions, search.trim(), {
    attributes: [
      { name: "label", getter: (option) => option.label },
      { name: "description", getter: (option) => option.description ?? "" },
    ],
  });
  const atLimit = multiple && chosen.length >= props.maxSelected;
  const canClear = multiple
    ? chosen.length > 0
    : props.resetValue !== undefined && props.value !== props.resetValue;
  const feedback = error
    ? "Couldn’t load values"
    : loading
      ? "Loading values…"
      : matches.length
        ? `${matches.length} ${matches.length === 1 ? "value" : "values"}`
        : (props.emptyMessage ?? "No matching values");

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function select(selection: Selection) {
    if (selection === "all") return;
    const ids = [...selection].map(String);
    if (multiple) {
      if (ids.length <= props.maxSelected) props.onChange(ids);
    } else {
      const id = ids[0];
      if (id !== undefined) {
        props.onChange(id);
        setOpen(false);
      }
    }
  }

  function clear() {
    if (multiple) props.onChange([]);
    else if (props.resetValue !== undefined) props.onChange(props.resetValue);
  }

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <Button
        aria-haspopup="dialog"
        aria-controls={open ? popupId : undefined}
        className="altertable-combobox-trigger"
        isDisabled={disabled}
        aria-label={`${label}: ${display}`}
      >
        <span className="altertable-combobox-label" aria-hidden="true">
          {label}
        </span>
        <strong className="altertable-combobox-value" aria-hidden="true">
          {display}
        </strong>
        <AppIcon name="disclosure" size={14} />
      </Button>
      <Popover className="altertable-combobox-popover" placement="bottom start">
        <Dialog id={popupId} aria-label={`${label} options`} className="altertable-combobox-dialog">
          <Input
            ref={searchRef}
            aria-label={`Search ${label.toLocaleLowerCase()} values`}
            aria-describedby={statusId}
            className="altertable-combobox-search"
            placeholder={props.placeholder ?? "Search values"}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" || !matches.length) return;
              event.preventDefault();
              listRef.current?.focus();
            }}
          />
          <output id={statusId} className="altertable-combobox-status">
            {feedback}
            {atLimit ? `. Maximum of ${props.maxSelected} selections reached.` : ""}
          </output>
          <GradientScroll className="altertable-combobox-options">
            <ListBox
              ref={listRef}
              items={matches}
              aria-label={`${label} values`}
              aria-describedby={statusId}
              selectionMode={multiple ? "multiple" : "single"}
              selectionBehavior={multiple ? "toggle" : "replace"}
              selectedKeys={selected}
              onSelectionChange={select}
              renderEmptyState={() => (
                <div className="altertable-combobox-empty">
                  {feedback}
                  {error && onRetry && <Button onPress={onRetry}>Try again</Button>}
                </div>
              )}
            >
              {(hit) => (
                <ListBoxItem
                  id={hit.item.id}
                  textValue={hit.item.label}
                  data-missing={hit.item.id === missingOption?.id || undefined}
                  isDisabled={atLimit && !selected.has(hit.item.id)}
                >
                  <span className="altertable-combobox-option-mark" aria-hidden="true" />
                  <span className="altertable-combobox-option-content">
                    <span>
                      <SearchMatch match={hit.matches.label} />
                    </span>
                    {hit.item.description && (
                      <small>
                        <SearchMatch match={hit.matches.description} />
                      </small>
                    )}
                  </span>
                </ListBoxItem>
              )}
            </ListBox>
          </GradientScroll>
          {(canClear || (error && matches.length > 0)) && (
            <div className="altertable-combobox-actions">
              {canClear && <Button onPress={clear}>Clear filter</Button>}
              {error && matches.length > 0 && onRetry && (
                <Button onPress={onRetry}>Try again</Button>
              )}
            </div>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
