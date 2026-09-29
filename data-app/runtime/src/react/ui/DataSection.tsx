import type { ComponentPropsWithRef, ReactNode } from "react";
import { DataAppError } from "../../client/index.ts";
import { Button } from "./Button.tsx";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import { DataBoundary } from "./DataBoundary.tsx";
import type { DataView } from "../../core/data-view.ts";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import { StatusPanel } from "./StatusPanel.tsx";

function errorPresentation(cause: Error) {
  const code = cause instanceof DataAppError ? cause.code : "request_failed";
  switch (code) {
    case "source_unauthorized":
      return {
        title: "Connection needs attention",
        description: "Ask the app owner to reconnect the lakehouse.",
        retryable: false,
      };
    case "source_forbidden":
      return {
        title: "Data access denied",
        description: "The selected profile cannot read this data. Ask the app owner for access.",
        retryable: false,
      };
    case "source_query_rejected":
      return {
        title: "This view cannot run its query",
        description: "Ask the app owner to check the data operation.",
        retryable: false,
      };
    case "source_rate_limited":
      return {
        title: "Data source is busy",
        description: "The lakehouse is handling too many requests.",
        retryable: true,
      };
    case "timeout":
      return {
        title: "Request timed out",
        description: "The lakehouse took too long to respond.",
        retryable: true,
      };
    case "source_unavailable":
      return {
        title: "Couldn’t load results",
        description: "The lakehouse isn’t responding.",
        retryable: true,
      };
    default:
      return {
        title: "Couldn’t load results",
        description: "The data request failed.",
        retryable: true,
      };
  }
}

type SectionEmpty = Pick<EmptyStateProps, "title" | "description">;
export type SectionResult<Data, Input> = {
  view: DataView<Data, Input>;
  refetch: () => unknown;
};

export type DataSectionProps<Data, Input = unknown> = {
  result: SectionResult<Data, Input>;
  empty: SectionEmpty;
  children: (data: Data, displayedInput: Input) => ReactNode;
  /** Placeholder layout for an initial request; use the ready view's grid without copied values. */
  loading?: ReactNode;
  error?: { title: ReactNode; description?: ReactNode; onRetry?: () => void };
  label?: string;
  /** DataApp suppresses this local notice in favor of its page-level toast. */
  notice?: "inline" | "none";
  dimOnUpdate?: boolean;
} & Omit<ComponentPropsWithRef<"div">, "children">;

/** One request boundary for any number of cards. `DataBoundary` exposes the lower-level
 * view-state slots for custom composition. */
export function DataSection<Data, Input>({
  result,
  children,
  empty,
  loading,
  error,
  label,
  notice = "inline",
  dimOnUpdate = false,
  ...props
}: DataSectionProps<Data, Input>) {
  return (
    <DataBoundary
      {...props}
      view={result.view}
      role={label ? "region" : undefined}
      aria-label={label}
      notice={notice}
      dimOnUpdate={dimOnUpdate}
      loading={loading ?? <ContentSkeleton variant="panel" />}
      empty={<EmptyState {...empty} />}
      error={(cause) => {
        const presentation = errorPresentation(cause);
        const retryAction =
          error?.onRetry ?? (presentation.retryable ? () => void result.refetch() : undefined);
        return (
          <StatusPanel
            status="error"
            title={error?.title ?? presentation.title}
            description={error?.description ?? presentation.description}
            action={retryAction && <Button onClick={retryAction}>Retry</Button>}
          />
        );
      }}
      staleError={() => (
        <Button onClick={error?.onRetry ?? (() => void result.refetch())}>Retry</Button>
      )}
    >
      {children}
    </DataBoundary>
  );
}
