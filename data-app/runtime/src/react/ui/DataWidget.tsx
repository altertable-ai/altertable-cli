import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { formatCount } from "../../core/format.ts";
import type { DataReading } from "../../core/reading.ts";
import { AboutData } from "./AboutData.tsx";
import { AppIcon } from "./icons.ts";
import { Button } from "./Button.tsx";
import { classNames } from "./classNames.ts";
import { ContentSkeleton, type ContentSkeletonProps } from "./ContentSkeleton.tsx";
import { EmptyState, type EmptyStateProps } from "./EmptyState.tsx";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import "./Inspect.css";
import "./DataWidget.css";

type Empty = Pick<EmptyStateProps, "title" | "description">;

type DataWidgetBaseProps = {
  title: ReactNode;
  count?: number;
  description?: ReactNode;
  evidence?: WidgetEvidence;
  action?: ReactNode;
  status?: { kind: "updating" | "error"; message: string; onRetry?: () => void };
  footer?: ReactNode;
  bodyPadding?: "inset" | "flush";
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/** A standard widget shell; a bound reading supplies loading, empty, and ready content. */
export type DataWidgetProps<Data = unknown> = DataWidgetBaseProps &
  (
    | {
        reading: DataReading<Data>;
        isEmpty: (data: Data) => boolean;
        empty: Empty;
        evidence: WidgetEvidence;
        skeleton?: Pick<ContentSkeletonProps, "variant" | "rows">;
        children: (data: Data) => ReactNode;
      }
    | {
        reading?: never;
        isEmpty?: never;
        skeleton?: never;
        empty?: Empty;
        children: ReactNode;
      }
  );

export function DataWidget<Data>(props: DataWidgetProps<Data>) {
  if (props.reading) {
    const { reading, isEmpty, empty, skeleton, children, ...shell } = props;
    if (reading.loading)
      return <ContentSkeleton variant="panel" {...skeleton} className={shell.className} />;
    const noData = isEmpty(reading.value);
    return (
      <DataWidgetContent {...shell} empty={noData ? empty : undefined}>
        {noData ? null : children(reading.value)}
      </DataWidgetContent>
    );
  }
  return <DataWidgetContent {...props} />;
}

function DataWidgetContent({
  title,
  count,
  description,
  evidence,
  action,
  status,
  footer,
  empty,
  bodyPadding = "inset",
  children,
  className,
  ...props
}: DataWidgetBaseProps & { empty?: Empty; children: ReactNode }) {
  const titleId = useId();
  const content = empty ? <EmptyState {...empty} /> : children;
  const help = evidence && (
    <AboutData
      id={evidence.id}
      references={{
        kind: "ids",
        glossaryIds: evidence.glossaryIds,
        queryNames: evidence.queryNames,
      }}
      iconOnly
      variant="ghost"
      className="altertable-inspect-trigger"
      tooltip="Explore this widget"
      shortcut={false}
      title={title}
      description={description}
      visual={content}
    >
      <AppIcon name="openDetails" />
    </AboutData>
  );
  return (
    <section
      {...props}
      className={classNames("altertable-data-widget", className)}
      aria-labelledby={props["aria-labelledby"] ?? titleId}
    >
      <header className="altertable-data-widget-header">
        <div>
          <h2 id={titleId}>
            {title}
            {count !== undefined && (
              <span className="altertable-data-widget-count">{formatCount(count)}</span>
            )}
          </h2>
          {description && <p>{description}</p>}
          {status && (
            <div
              className="altertable-data-widget-status"
              data-state={status.kind}
              role={status.kind === "error" ? "alert" : "status"}
            >
              {status.kind === "error" ? (
                <AppIcon name="error" size={14} />
              ) : (
                <AppIcon
                  name="loading"
                  size={14}
                  className="altertable-data-widget-status-spinner"
                />
              )}
              <span>{status.message}</span>
              {status.onRetry && (
                <Button variant="ghost" onClick={status.onRetry}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
        {(help || action) && (
          <div className="altertable-data-widget-help">
            {action}
            {help}
          </div>
        )}
      </header>
      <div className="altertable-data-widget-body" data-padding={empty ? "flush" : bodyPadding}>
        {content}
      </div>
      {footer && <footer className="altertable-data-widget-footer">{footer}</footer>}
    </section>
  );
}
