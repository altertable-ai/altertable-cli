import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import { AppIcon } from "../primitives/icons.ts";
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
    <form
      {...props}
      role="search"
      aria-label={props["aria-label"] ?? label}
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
        <div className="altertable-search-input-wrap">
          <AppIcon name="search" size={17} />
          <input
            {...inputProps}
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
          />
          {value !== resetValue && (
            <button
              {...clearButtonProps}
              type="button"
              className={classNames("altertable-search-clear", clearButtonProps?.className)}
              aria-label={clearButtonProps?.["aria-label"] ?? `Clear ${label.toLowerCase()}`}
              onClick={(event) => {
                clearButtonProps?.onClick?.(event);
                if (!event.defaultPrevented) onChange(resetValue);
              }}
            >
              <AppIcon name="reset" size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
      {description && (
        <p id={descriptionId} className="altertable-search-description">
          {description}
        </p>
      )}
      {status && (
        <p
          id={statusId}
          className="altertable-search-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {status}
        </p>
      )}
    </form>
  );
}
