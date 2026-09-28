import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./StatusPanel.css";

export type StatusPanelProps = {
  status: "loading" | "empty" | "error";
  title: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children" | "title">;

/** Shared loading, empty, and error surface. Pass a runtime `Button` as the action;
 * children extend the message body. */
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
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
        {details && <small>{details}</small>}
        {children}
      </div>
      {action && <div className="altertable-status-action">{action}</div>}
    </div>
  );
}
