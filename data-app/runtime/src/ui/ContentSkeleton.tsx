import type { ComponentPropsWithRef } from "react";
import { classNames } from "./classNames.ts";
import { Skeleton } from "./Skeleton.tsx";
import "./ContentSkeleton.css";

export type ContentSkeletonProps = {
  variant: "metric" | "panel" | "ranking";
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** A metric, panel, or ranking placeholder to compose in the same layout as live content. */
export function ContentSkeleton({ variant, className, ...props }: ContentSkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={classNames(
        `altertable-${variant === "metric" ? "metric-card" : "data-panel"}`,
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
          {[0, 1, 2, 3].map((row) => (
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
