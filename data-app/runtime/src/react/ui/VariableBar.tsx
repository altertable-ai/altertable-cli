import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./VariableBar.css";

export type VariableBarProps = {
  children: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Reader-controlled inputs below the page header. */
export function VariableBar({
  children,
  className,
  role = "group",
  "aria-label": ariaLabel = "View variables",
  ...props
}: VariableBarProps) {
  return (
    <div
      {...props}
      className={classNames("altertable-variable-bar", className)}
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
