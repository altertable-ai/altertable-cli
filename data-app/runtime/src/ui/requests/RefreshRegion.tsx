import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import "./RefreshRegion.css";

export type RefreshRegionProps = {
  refreshing: boolean;
  dimOnUpdate?: boolean;
  children: ReactNode;
  contentProps?: Omit<ComponentPropsWithRef<"div">, "children" | "aria-busy">;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Keep prior content in place while a fresh result loads. Local results can opt into dimming. */
export function RefreshRegion({
  refreshing,
  dimOnUpdate = false,
  children,
  contentProps,
  className,
  ...props
}: RefreshRegionProps) {
  return (
    <div {...props} className={classNames("altertable-refresh-region", className)}>
      <div
        {...contentProps}
        className={classNames("altertable-refresh-content", contentProps?.className)}
        data-refreshing={refreshing && dimOnUpdate}
        aria-busy={refreshing}
      >
        {children}
      </div>
    </div>
  );
}
