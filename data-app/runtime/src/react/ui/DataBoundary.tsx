import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import "./DataBoundary.css";

import type { DataView } from "../../core/data-view.ts";

export type DataBoundaryProps<T, Input = unknown> = {
  view: DataView<T, Input>;
  loading: ReactNode;
  empty: ReactNode;
  error: (error: Error) => ReactNode;
  staleError?: (error: Error) => ReactNode;
  notice?: "inline" | "none";
  dimOnUpdate?: boolean;
  children: (data: T, displayedInput: Input) => ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** Render one request state at a time. Prior content remains readable during an update.
 * Local boundaries can opt into an inline notice and delayed dimming. */
export function DataBoundary<T, Input>({
  view,
  loading,
  empty,
  error,
  staleError,
  notice = "none",
  dimOnUpdate = false,
  children,
  className,
  ...props
}: DataBoundaryProps<T, Input>) {
  if (view.kind === "loading" || view.kind === "empty" || view.kind === "error")
    return (
      <div {...props} className={classNames("altertable-data-boundary", className)}>
        {view.kind === "loading" ? loading : view.kind === "empty" ? empty : error(view.error)}
      </div>
    );

  const updating = view.kind === "updating";
  const hasStaleError = view.kind === "stale-error";
  return (
    <div {...props} className={classNames("altertable-data-boundary", className)}>
      {notice === "inline" && (updating || hasStaleError) && (
        <div
          className="altertable-data-boundary-notice"
          data-state={view.kind}
          role={hasStaleError ? "alert" : "status"}
        >
          {updating ? (
            <AppIcon name="loading" size={16} className="altertable-data-boundary-spinner" />
          ) : (
            <AppIcon name="error" size={16} />
          )}
          <span className="altertable-data-boundary-message">{view.message}</span>
          {staleError && view.kind === "stale-error" && (
            <span className="altertable-data-boundary-action">{staleError(view.error)}</span>
          )}
        </div>
      )}
      <div
        className="altertable-data-boundary-content"
        data-updating={(updating && dimOnUpdate) || undefined}
      >
        {children(view.data, view.kind === "ready" ? view.input : view.displayedInput)}
      </div>
    </div>
  );
}
