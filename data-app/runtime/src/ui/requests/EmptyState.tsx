import type { ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import "./EmptyState.css";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  variant?: "visual" | "table";
  className?: string;
};

/** Content-level empty state for visualizations and tables with valid, zero-row results. */
export function EmptyState({ title, description, variant = "visual", className }: EmptyStateProps) {
  return (
    <div
      className={classNames("altertable-empty-state", className)}
      data-variant={variant}
      role="status"
    >
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}
