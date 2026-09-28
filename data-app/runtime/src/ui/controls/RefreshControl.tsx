import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import "./RefreshControl.css";

export type RefreshControlProps = {
  refreshing: boolean;
  children: ReactNode;
  label?: string;
  statusProps?: Omit<ComponentPropsWithRef<"div">, "children" | "role">;
  status?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Show refresh progress in place after a short delay, with a visually hidden
 * status announcement. Fast refreshes show nothing. */
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
      {children}
      <div
        {...statusProps}
        className={classNames("altertable-refresh-status", statusProps?.className)}
        role="status"
      >
        {slow && refreshing ? (status ?? label) : null}
      </div>
    </div>
  );
}
