import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import "./Grid.css";

export type GridProps = {
  children: ReactNode;
  /** Maximum columns; cards wrap sooner when the container cannot fit their minimum width. */
  columns?: 1 | 2 | 3 | 4;
  minItemWidth?: "compact" | "regular" | "wide";
  gap?: "sm" | "md" | "lg";
  /** Stretch peer cards to the tallest item in their row only when needed. */
  align?: "stretch" | "start";
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Responsive layout for peer cards and panels. Cards keep their content height by default. */
export function Grid({
  children,
  columns = 1,
  minItemWidth = "regular",
  gap = "lg",
  align = "start",
  className,
  ...props
}: GridProps) {
  return (
    <div
      {...props}
      className={classNames("altertable-grid", className)}
      data-columns={columns}
      data-min-item-width={minItemWidth}
      data-gap={gap}
      data-align={align}
    >
      {children}
    </div>
  );
}
