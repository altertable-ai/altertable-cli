import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./RefreshControl.css";

export type RefreshControlProps = {
  refreshing: boolean;
  children: ReactNode;
  label?: string;
  statusProps?: Omit<ComponentPropsWithRef<"div">, "children" | "role">;
  status?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Show refresh progress just before its action after a short delay. */
export function RefreshControl({
  refreshing,
  children,
  label = "Refreshing data",
  statusProps,
  status,
  className,
  ...props
}: RefreshControlProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!refreshing) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 300);
    return () => window.clearTimeout(timer);
  }, [refreshing]);

  return (
    <div
      {...props}
      className={classNames("altertable-refresh-control", className)}
      data-refreshing={slow && refreshing ? "" : undefined}
    >
      <div
        {...statusProps}
        className={classNames("altertable-refresh-status", statusProps?.className)}
        role="status"
      >
        {slow && refreshing ? (status ?? label) : null}
      </div>
      {children}
    </div>
  );
}
