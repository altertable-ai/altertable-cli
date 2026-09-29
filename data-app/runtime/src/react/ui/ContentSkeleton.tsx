import type { ComponentPropsWithRef } from "react";
import { invariant } from "../../core/invariant.ts";
import { classNames } from "./classNames.ts";
import { Skeleton } from "./Skeleton.tsx";
import "./ContentSkeleton.css";

export type ContentSkeletonProps = {
  rows?: number;
  variant: "metric" | "panel" | "ranking";
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** A metric, panel, or ranking placeholder to compose in the same layout as live content. */
export function ContentSkeleton({ variant, rows = 4, className, ...props }: ContentSkeletonProps) {
  invariant(
    Number.isInteger(rows) && rows >= 0 && rows <= 100,
    "Skeleton rows must be between 0 and 100.",
  );
  return (
    <div
      {...props}
      aria-hidden="true"
      className={classNames(
        `altertable-${variant === "metric" ? "metric-widget" : "data-panel"}`,
        "altertable-content-skeleton",
        className,
      )}
    >
      <Skeleton className="altertable-content-skeleton-label" />
      <Skeleton
        className={
          variant === "metric"
            ? "altertable-content-skeleton-value"
            : variant === "ranking"
              ? "altertable-content-skeleton-subtitle"
              : "altertable-content-skeleton-chart"
        }
      />
      {variant === "panel" && <Skeleton className="altertable-content-skeleton-foot" />}
      {variant === "ranking" && (
        <div className="altertable-content-skeleton-rows">
          {Array.from({ length: rows }, (_, index) => index).map((row) => (
            <div className="altertable-content-skeleton-row" key={row}>
              <Skeleton className="altertable-content-skeleton-row-label" />
              <Skeleton className="altertable-content-skeleton-row-track" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
