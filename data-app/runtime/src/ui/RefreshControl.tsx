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
  const [delay, setDelay] = useState({ refreshing, elapsed: false });
  if (delay.refreshing !== refreshing) setDelay({ refreshing, elapsed: false });

  useEffect(() => {
    if (!refreshing) return;
    const timer = window.setTimeout(() => setDelay({ refreshing: true, elapsed: true }), 300);
    return () => window.clearTimeout(timer);
  }, [refreshing]);
  const slow = refreshing && delay.refreshing && delay.elapsed;

  return (
    <div
      {...props}
      className={classNames("altertable-refresh-control", className)}
      data-refreshing={slow && refreshing ? "" : undefined}
    >
      <div
        {...statusProps}
        className={classNames("altertable-refresh-status", statusProps?.className)}
        aria-live="polite"
        aria-atomic="true"
      >
        {slow && refreshing ? (status ?? label) : null}
      </div>
      {children}
    </div>
  );
}
