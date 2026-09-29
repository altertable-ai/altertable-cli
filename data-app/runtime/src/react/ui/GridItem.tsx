import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";

export type GridItemProps = {
  children: ReactNode;
  /** Maximum tracks occupied; collapses to one when the grid container is narrow. */
  span?: 1 | 2;
} & Omit<ComponentPropsWithRef<"div">, "children">;

export function GridItem({ children, span = 1, className, ...props }: GridItemProps) {
  return (
    <div {...props} className={classNames("altertable-grid-item", className)} data-span={span}>
      {children}
    </div>
  );
}
