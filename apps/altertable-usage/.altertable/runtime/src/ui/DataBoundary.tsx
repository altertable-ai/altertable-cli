import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import "./DataBoundary.css";

export type DataView<T, Input = unknown> =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; error: Error }
  | { kind: "ready"; data: T; input: Input }
  | { kind: "updating"; data: T; requestedInput: Input; displayedInput: Input; message: string }
  | {
      kind: "stale-error";
      data: T;
      requestedInput: Input;
      displayedInput: Input;
      error: Error;
      message: string;
    };

export type DataSnapshot<Data, Input> = { data: Data; input: Input };

/** Keep the requested input separate from the input that produced visible data. */
export function resolveDataView<Data, Input>({
  requestedInput,
  current,
  previous,
  pending,
  error,
  sameInput,
  describe,
  isEmpty,
}: {
  requestedInput: Input;
  current?: DataSnapshot<Data, Input>;
  previous?: DataSnapshot<Data, Input>;
  pending: boolean;
  error?: Error;
  sameInput: (a: Input, b: Input) => boolean;
  describe: (input: Input) => string;
  isEmpty: (data: Data) => boolean;
}): DataView<Data, Input> {
  const shown = current ?? previous;
  if (!shown) return error ? { kind: "error", error } : { kind: "loading" };
  const currentInput = sameInput(shown.input, requestedInput);
  if (error)
    return {
      kind: "stale-error",
      data: shown.data,
      displayedInput: shown.input,
      requestedInput,
      error,
      message: currentInput
        ? `Couldn’t refresh. Showing the last result for ${describe(shown.input)}.`
        : `Couldn’t refresh. Showing ${describe(shown.input)} while ${describe(requestedInput)} is unavailable.`,
    };
  if (pending || !currentInput)
    return {
      kind: "updating",
      data: shown.data,
      displayedInput: shown.input,
      requestedInput,
      message: currentInput
        ? `Updating ${describe(requestedInput)}…`
        : `Showing ${describe(shown.input)} while loading ${describe(requestedInput)}…`,
    };
  return isEmpty(shown.data)
    ? { kind: "empty" }
    : { kind: "ready", data: shown.data, input: shown.input };
}

export type DataBoundaryProps<T, Input = unknown> = {
  view: DataView<T, Input>;
  loading: ReactNode;
  empty: ReactNode;
  error: (error: Error) => ReactNode;
  staleError?: (error: Error) => ReactNode;
  notice?: "inline" | "none";
  dimOnUpdate?: boolean;
  children: (data: T) => ReactNode;
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
        {children(view.data)}
      </div>
    </div>
  );
}
