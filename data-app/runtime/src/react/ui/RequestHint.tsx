import { AppIcon } from "./icons.ts";
import { Button } from "./Button.tsx";
import "./RequestHint.css";

/** Idle keeps the same reserved space as refresh and failure. Initial loading belongs to skeletons. */
export type WidgetStatus =
  | { kind: "idle" }
  | { kind: "updating"; message?: string }
  | { kind: "error"; message?: string; onRetry?: () => void };

/** Fixed-height feedback keeps data in place; the retry belongs beside its failure message. */
export function RequestHint({
  status,
  retryLabel = "Retry",
}: {
  status?: WidgetStatus;
  retryLabel?: string;
}) {
  const active = status && status.kind !== "idle";
  const message = active
    ? (status.message ?? (status.kind === "error" ? "Couldn’t refresh" : "Refreshing…"))
    : "";
  return (
    <div
      className="altertable-request-hint"
      data-state={status?.kind ?? "idle"}
      role={status?.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      {active && (
        <>
          <AppIcon
            name={status.kind === "error" ? "error" : "loading"}
            size={14}
            className={status.kind === "updating" ? "altertable-request-hint-spinner" : undefined}
          />
          <span className="altertable-request-hint-message" title={message}>
            {message}
          </span>
          {status.kind === "error" && status.onRetry && (
            <Button variant="ghost" size="compact" onClick={status.onRetry}>
              {retryLabel}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
