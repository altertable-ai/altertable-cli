import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import "./Grid.css";

export type GridProps = {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  align?: "stretch" | "start";
} & Omit<ComponentPropsWithRef<"div">, "children">;

export function Grid({
  children,
  columns = 1,
  gap = "md",
  align = "stretch",
  className,
  ...props
}: GridProps) {
  return (
    <div
      {...props}
      className={classNames("altertable-grid", className)}
      data-columns={columns}
      data-gap={gap}
      data-align={align}
    >
      {children}
    </div>
  );
}
