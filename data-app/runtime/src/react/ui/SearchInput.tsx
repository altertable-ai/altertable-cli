import type { ComponentPropsWithRef, ReactNode } from "react";
import { AppIcon } from "./icons.ts";
import { classNames } from "./classNames.ts";
import "./SearchInput.css";

/** One search control surface for picker search and table/page search. */
export function SearchInput({
  size = "default",
  endAction,
  loading = false,
  className,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "size" | "children"> & {
  size?: "default" | "compact";
  endAction?: ReactNode;
  /** Replaces the search glyph in its existing space; input and results remain usable. */
  loading?: boolean;
}) {
  return (
    <div className="altertable-search-input-wrap" data-size={size}>
      <AppIcon
        name={loading ? "loading" : "search"}
        size={17}
        className={loading ? "altertable-search-input-spinner" : undefined}
      />
      <input
        {...props}
        type="search"
        className={classNames("altertable-search-input", className)}
      />
      {endAction}
    </div>
  );
}
