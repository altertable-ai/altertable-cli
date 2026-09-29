import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import "./StatusPanel.css";

export type StatusPanelProps = {
  status: "loading" | "empty" | "error";
  title: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children" | "title">;

export function StatusPanel({
  status,
  title,
  description,
  details,
  action,
  children,
  className,
  role,
  ...props
}: StatusPanelProps) {
  return (
    <div
      {...props}
      className={classNames("altertable-status-panel", className)}
      data-status={status}
      role={role ?? (status === "error" ? "alert" : "status")}
    >
      {status === "error" && <AppIcon name="error" size={18} />}
      <div className="altertable-status-copy">
        <strong>{title}</strong>
        {description && <p>{description}</p>}
        {details && <small>{details}</small>}
        {children}
      </div>
      {action && <div className="altertable-status-action">{action}</div>}
    </div>
  );
}
