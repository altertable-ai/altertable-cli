import type { ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./EmptyState.css";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  variant?: "visual" | "table";
  className?: string;
};

export function EmptyState({ title, description, variant = "visual", className }: EmptyStateProps) {
  return (
    <div
      className={classNames("altertable-empty-state", className)}
      data-variant={variant}
      aria-live="polite"
      aria-atomic="true"
    >
      {description ? (
        <>
          <strong>{title}</strong>
          <p>{description}</p>
        </>
      ) : (
        <p>{title}</p>
      )}
    </div>
  );
}
