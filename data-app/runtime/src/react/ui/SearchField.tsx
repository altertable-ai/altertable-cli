import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { classNames } from "./classNames.ts";
import { SearchInput } from "./SearchInput.tsx";
import { Button } from "./Button.tsx";
import { AppIcon } from "./icons.ts";
import "./SearchField.css";

export type SearchFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  showLabel?: boolean;
  size?: "default" | "compact";
  description?: ReactNode;
  status?: ReactNode;
  busy?: boolean;
  resetValue?: string;
  inputProps?: Omit<ComponentPropsWithRef<"input">, "type" | "value" | "children">;
  clearButtonProps?: Omit<ComponentPropsWithRef<"button">, "type" | "children">;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<"form">, "onChange" | "onSubmit" | "children">;

/**
 * The caller owns filtering, URL state, and whether search runs while typing or on submit.
 * Escape and Clear reset the query.
 */
export function SearchField({
  label,
  value,
  onChange,
  onSubmit,
  placeholder,
  showLabel = false,
  size = "default",
  description,
  status,
  busy,
  resetValue = "",
  inputProps,
  clearButtonProps,
  children,
  className,
  ...props
}: SearchFieldProps) {
  const id = useId();
  const inputId = inputProps?.id ?? id;
  const descriptionId = description ? `${id}-description` : undefined;
  const statusId = status ? `${id}-status` : undefined;
  return (
    <search className="altertable-search-landmark" aria-label={props["aria-label"] ?? label}>
      <form
        {...props}
        className={classNames("altertable-search", className)}
        data-size={size}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(value);
        }}
      >
        <label
          htmlFor={inputId}
          className={classNames("altertable-search-label", !showLabel && "altertable-sr-only")}
        >
          {label}
        </label>
        <div className="altertable-search-row">
          <SearchInput
            {...inputProps}
            size={size}
            id={inputId}
            type="search"
            value={value}
            placeholder={placeholder ?? "Search"}
            enterKeyHint="search"
            aria-busy={busy || undefined}
            aria-describedby={
              [descriptionId, statusId, inputProps?.["aria-describedby"]]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={classNames("altertable-search-input", inputProps?.className)}
            onChange={(event) => {
              inputProps?.onChange?.(event);
              if (!event.defaultPrevented) onChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              inputProps?.onKeyDown?.(event);
              if (!event.defaultPrevented && event.key === "Escape" && value !== resetValue) {
                event.preventDefault();
                onChange(resetValue);
              }
            }}
            endAction={
              value !== resetValue && (
                <Button
                  {...clearButtonProps}
                  variant="ghost"
                  size="icon-compact"
                  className={clearButtonProps?.className}
                  aria-label={clearButtonProps?.["aria-label"] ?? `Clear ${label.toLowerCase()}`}
                  onClick={(event) => {
                    clearButtonProps?.onClick?.(event);
                    if (!event.defaultPrevented) onChange(resetValue);
                  }}
                >
                  <AppIcon name="reset" size={16} />
                </Button>
              )
            }
          />
          {children}
        </div>
        {description && (
          <p id={descriptionId} className="altertable-search-description">
            {description}
          </p>
        )}
        {status && (
          <output id={statusId} className="altertable-search-status">
            {status}
          </output>
        )}
      </form>
    </search>
  );
}
