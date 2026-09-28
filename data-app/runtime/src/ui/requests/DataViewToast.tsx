import { useEffect, useState, type ReactNode } from "react";
import type { DataView } from "./DataBoundary.tsx";
import { AppIcon } from "../primitives/icons.ts";
import { Button } from "../primitives/Button.tsx";
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
  const [showUpdating, setShowUpdating] = useState(false);
  useEffect(() => {
    if (view.kind !== "updating") {
      setShowUpdating(false);
      return;
    }
    const timer = window.setTimeout(() => setShowUpdating(true), 450);
    return () => window.clearTimeout(timer);
  }, [view.kind]);

  if (view.kind !== "stale-error" && (view.kind !== "updating" || !showUpdating) && !notice)
    return null;
  const failed = view.kind === "stale-error";
  const showingUpdate = view.kind === "updating" && showUpdating;
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
        <span>
          {failed
            ? (message ?? "Couldn’t refresh data. Showing the last available result.")
            : showingUpdate
              ? (message ?? "Checking for updates. Showing the last result.")
              : notice}
        </span>
        {failed && onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}
