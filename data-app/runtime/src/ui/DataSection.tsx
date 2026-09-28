import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./Button.tsx";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import { DataBoundary, type DataView } from "./DataBoundary.tsx";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import { StatusPanel } from "./StatusPanel.tsx";

export type DataSectionProps<Data, Input = unknown> = (
  | { view: DataView<Data, Input>; result?: never }
  | { result: { view: DataView<Data, Input>; refetch: () => unknown }; view?: never }
) & {
  children: (data: Data, displayedInput: Input) => ReactNode;
  empty?: Pick<EmptyStateProps, "title" | "description">;
  /** Placeholder layout for an initial request; use the ready view's grid without copied values. */
  loading?: ReactNode;
  error?: { title: ReactNode; description?: ReactNode; onRetry?: () => void };
  label?: string;
  /** DataApp suppresses this local notice in favor of its page-level toast. */
  notice?: "inline" | "none";
  dimOnUpdate?: boolean;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** One request boundary for any number of cards. Pass `useDataView` as `result` for
 * automatic retry and stale-data notices, or a manually resolved `view`. */
export function DataSection<Data, Input>({
  view,
  result,
  children,
  empty,
  loading,
  error,
  label,
  notice = result ? "inline" : "none",
  dimOnUpdate = !!result,
  ...props
}: DataSectionProps<Data, Input>) {
  const dataView = result?.view ?? view;
  if (!dataView) throw new Error("DataSection needs a data view.");
  const retryAction = error?.onRetry ?? (result ? () => void result.refetch() : undefined);
  const retry = retryAction && <Button onClick={retryAction}>Try again</Button>;
  return (
    <DataBoundary
      {...props}
      view={dataView}
      role={label ? "region" : undefined}
      aria-label={label}
      notice={notice}
      dimOnUpdate={dimOnUpdate}
      loading={loading ?? <ContentSkeleton variant="panel" />}
      empty={<EmptyState {...(empty ?? { title: "No data in this range" })} />}
      error={(cause) => (
        <StatusPanel
          status="error"
          title={error?.title ?? "Couldn’t load data"}
          description={error?.description ?? cause.message}
          action={retry}
        />
      )}
      staleError={() => retry}
    >
      {children}
    </DataBoundary>
  );
}
