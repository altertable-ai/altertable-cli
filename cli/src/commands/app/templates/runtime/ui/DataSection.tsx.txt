import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./Button.tsx";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import { DataBoundary, type DataView } from "./DataBoundary.tsx";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import { StatusPanel } from "./StatusPanel.tsx";

export type DataSectionProps<Data, Input = unknown> = {
  view: DataView<Data, Input>;
  children: (data: Data) => ReactNode;
  empty?: Pick<EmptyStateProps, "title" | "description">;
  loading?: ReactNode;
  error?: { title: ReactNode; description?: ReactNode; onRetry?: () => void };
  label?: string;
  /** Use inline when there is no page-level DataViewToast for this request. */
  notice?: "inline" | "none";
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** One request boundary for any number of ready-data cards. A measured zero remains ready. */
export function DataSection<Data, Input>({
  view,
  children,
  empty,
  loading,
  error,
  label,
  notice = "none",
  ...props
}: DataSectionProps<Data, Input>) {
  const retry = error?.onRetry && <Button onClick={error.onRetry}>Try again</Button>;
  return (
    <DataBoundary
      {...props}
      view={view}
      role={label ? "region" : undefined}
      aria-label={label}
      notice={notice}
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
