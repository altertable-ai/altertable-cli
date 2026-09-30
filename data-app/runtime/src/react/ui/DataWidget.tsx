import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { formatCount } from "../../core/format.ts";
import type { DataReading } from "../../core/reading.ts";
import { AboutData } from "./AboutData.tsx";
import { AppIcon } from "./icons.ts";
import { WidgetStatusControl, type WidgetStatus } from "./RequestHint.tsx";
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
  /** Reserved feedback slot; retain displayed content while refreshing or after failure. */
  status?: WidgetStatus;
  footer?: ReactNode;
  bodyPadding?: "inset" | "flush";
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/** Owns loading, empty content, actions, and inspection. Page and sheet mount the same
 * body and footer; hold interactive child state above the widget to share it across mounts.
 * A bound reading requires evidence; its child renderer runs only for nonempty ready data. */
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
  const visual = (
    <WidgetContent bodyPadding={empty ? "flush" : bodyPadding} footer={footer} status={status}>
      {content}
    </WidgetContent>
  );
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
      headerActions={<WidgetStatusControl status={status} />}
      description={description}
      visual={visual}
      visualKind="widget"
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
        </div>
        <div className="altertable-data-widget-help">
          <WidgetStatusControl status={status} />
          {action}
          {help}
        </div>
      </header>
      {visual}
    </section>
  );
}

/** The page and inspection sheet render the same body and footer, with the same spacing. */
function WidgetContent({
  bodyPadding,
  footer,
  status,
  children,
}: {
  bodyPadding: "inset" | "flush";
  footer?: ReactNode;
  status?: WidgetStatus;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className="altertable-data-widget-body"
        data-padding={bodyPadding}
        aria-busy={status?.kind === "updating" || undefined}
      >
        {children}
      </div>
      {footer && <footer className="altertable-data-widget-footer">{footer}</footer>}
    </>
  );
}
