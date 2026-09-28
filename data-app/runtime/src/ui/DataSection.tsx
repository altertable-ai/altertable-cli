import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./Button.tsx";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import { DataBoundary, type DataView } from "./DataBoundary.tsx";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import { StatusPanel } from "./StatusPanel.tsx";
import { Skeleton } from "./Skeleton.tsx";
import type { ReportingPeriod } from "./PeriodSummary.tsx";
import "./DataSection.css";

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
  /** A fixed period or a period derived from the input that produced visible data. */
  reportingPeriod?: ReportingPeriod | ((displayedInput: Input) => ReportingPeriod);
  /** Use inline when there is no page-level DataViewToast for this request. */
  notice?: "inline" | "none";
  dimOnUpdate?: boolean;
} & Omit<ComponentPropsWithRef<"div">, "children">;

function periodLabel(period: ReportingPeriod): string {
  if (period.kind === "calendar") {
    const dates = period.start === period.end ? period.start : `${period.start} – ${period.end}`;
    return `${dates} · ${period.timeZone}`;
  }
  return `Last ${period.amount} ${period.unit}${period.amount === 1 ? "" : "s"} ending ${period.end}`;
}

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
  reportingPeriod,
  notice = "none",
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
      loading={
        reportingPeriod ? (
          <>
            <div className="altertable-data-section-period" aria-label="Reporting period">
              <span>Reporting period</span>
              <Skeleton className="altertable-data-section-period-placeholder" />
            </div>
            {loading ?? <ContentSkeleton variant="panel" />}
          </>
        ) : (
          (loading ?? <ContentSkeleton variant="panel" />)
        )
      }
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
      {(data, displayedInput) => (
        <>
          {reportingPeriod && (
            <div className="altertable-data-section-period" aria-label="Reporting period">
              <span>Reporting period</span>
              <strong>
                {periodLabel(
                  typeof reportingPeriod === "function"
                    ? reportingPeriod(displayedInput)
                    : reportingPeriod,
                )}
              </strong>
            </div>
          )}
          {children(data, displayedInput)}
        </>
      )}
    </DataBoundary>
  );
}
