import { useEffect, useState, type ReactNode } from "react";
import type { DataView } from "../../core/data-view.ts";
import { AppIcon } from "./icons.ts";
import { Button } from "./Button.tsx";
import "./DataViewToast.css";

export type DataViewToastProps<Data, Input> = {
  view: DataView<Data, Input>;
  message?: ReactNode;
  notice?: ReactNode;
  onRetry?: () => void;
};

/** One page-level refresh status. Updating waits briefly to avoid flashing on fast requests;
 * a failed update stays visible with its retry action until the view changes. */
export function DataViewToast<Data, Input>({
  view,
  message,
  notice,
  onRetry,
}: DataViewToastProps<Data, Input>) {
  const [delay, setDelay] = useState({ kind: view.kind, elapsed: false });
  if (delay.kind !== view.kind) setDelay({ kind: view.kind, elapsed: false });
  useEffect(() => {
    if (view.kind !== "updating") return;
    const timer = window.setTimeout(() => setDelay({ kind: "updating", elapsed: true }), 450);
    return () => window.clearTimeout(timer);
  }, [view.kind]);
  const showUpdating = view.kind === "updating" && delay.kind === "updating" && delay.elapsed;

  if (view.kind !== "stale-error" && (view.kind !== "updating" || !showUpdating) && !notice)
    return null;
  const failed = view.kind === "stale-error";
  const showingUpdate = view.kind === "updating" && showUpdating;
  const detail = view.kind === "stale-error" || view.kind === "updating" ? view.message : undefined;
  const icon = failed ? "error" : showingUpdate ? "loading" : "live";
  const state = failed ? "stale-error" : showingUpdate ? "updating" : "notice";
  return (
    <div className="altertable-data-view-toast-region">
      <div
        className="altertable-data-view-toast"
        data-state={state}
        role={failed ? "alert" : "status"}
      >
        <AppIcon
          name={icon}
          size={16}
          className={showingUpdate ? "altertable-data-view-toast-spinner" : undefined}
        />
        <span>{failed ? (message ?? detail) : showingUpdate ? (message ?? detail) : notice}</span>
        {failed && onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}
