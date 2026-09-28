import type { ComponentPropsWithRef } from "react";
import { classNames } from "./classNames.ts";
import { Skeleton } from "./Skeleton.tsx";
import "./ContentSkeleton.css";

export type ContentSkeletonProps = {
  variant: "metric" | "panel";
} & Omit<ComponentPropsWithRef<"div">, "children">;

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
            : "altertable-content-skeleton-chart"
        }
      />
      {variant === "panel" && <Skeleton className="altertable-content-skeleton-foot" />}
    </div>
  );
}
