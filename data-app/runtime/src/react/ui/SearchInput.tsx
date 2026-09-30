import type { ComponentPropsWithRef, ReactNode } from "react";
import { AppIcon } from "./icons.ts";
import { classNames } from "./classNames.ts";
import "./SearchInput.css";

/** One search control surface for picker search and table/page search. */
export function SearchInput({
  size = "default",
  endAction,
  className,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "size" | "children"> & {
  size?: "default" | "compact";
  endAction?: ReactNode;
}) {
  return (
    <div className="altertable-search-input-wrap" data-size={size}>
      <AppIcon name="search" size={17} />
      <input
        {...props}
        type="search"
        className={classNames("altertable-search-input", className)}
      />
      {endAction}
    </div>
  );
}
