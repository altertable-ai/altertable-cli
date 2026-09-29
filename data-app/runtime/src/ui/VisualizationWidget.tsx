import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import { DataPanel, type DataPanelProps } from "./DataPanel.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import type { DataReading } from "../reading.ts";
import { ContentSkeleton, type ContentSkeletonProps } from "./ContentSkeleton.tsx";
import { WidgetViewTabs } from "./WidgetViewTabs.tsx";
import "./VisualizationWidget.css";

type VisualizationWidgetBaseProps = {
  title: ReactNode;
  description?: ReactNode;
  insight?: ReactNode;
  action?: ReactNode;
  evidence?: WidgetEvidence;
  /** Status for a secondary request shown beside this card's heading. */
  status?: DataPanelProps["status"];
  /** Valid result with nothing to draw, such as no rows matching a local filter. */
  empty?: Pick<EmptyStateProps, "title" | "description">;
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

type UnboundVisualizationWidgetProps = VisualizationWidgetBaseProps &
  ({ loading: true; visual?: never } | { loading?: false; visual: ReactNode });

export type VisualizationWidgetView<Data> = {
  id: string;
  label: ReactNode;
  render: (data: Data) => ReactNode;
};

type BoundVisualizationWidgetBase<Data> = VisualizationWidgetBaseProps & {
  reading: DataReading<Data>;
  isEmpty: (data: Data) => boolean;
  empty: Pick<EmptyStateProps, "title" | "description">;
  skeleton?: Pick<ContentSkeletonProps, "variant" | "rows">;
  visual?: never;
  loading?: never;
};

export type VisualizationWidgetProps<Data = unknown> =
  | UnboundVisualizationWidgetProps
  | (BoundVisualizationWidgetBase<Data> & { children: (data: Data) => ReactNode; views?: never })
  | (BoundVisualizationWidgetBase<Data> & {
      views: readonly VisualizationWidgetView<Data>[];
      viewLabel: string;
      initialView?: string;
      children?: never;
    });

export function VisualizationWidget<Data>(props: VisualizationWidgetProps<Data>) {
  if ("views" in props && props.views) return <VisualizationWidgetWithViews {...props} />;
  if ("reading" in props) {
    const { reading, children, isEmpty, empty, skeleton, ...rest } = props;
    if (reading.loading)
      return <ContentSkeleton variant="panel" {...skeleton} className={rest.className} />;
    const noData = isEmpty(reading.value);
    return (
      <VisualizationWidgetContent
        {...rest}
        empty={noData ? empty : undefined}
        visual={noData ? null : children(reading.value)}
      />
    );
  }
  return <VisualizationWidgetContent {...props} />;
}

function VisualizationWidgetWithViews<Data>({
  reading,
  views,
  viewLabel,
  initialView,
  isEmpty,
  empty,
  skeleton,
  ...rest
}: BoundVisualizationWidgetBase<Data> & {
  views: readonly VisualizationWidgetView<Data>[];
  viewLabel: string;
  initialView?: string;
}) {
  const [selected, setSelected] = useState(initialView ?? views[0]?.id ?? "");
  if (reading.loading)
    return <ContentSkeleton variant="panel" {...skeleton} className={rest.className} />;
  const noData = isEmpty(reading.value);
  return (
    <VisualizationWidgetContent
      {...rest}
      empty={noData ? empty : undefined}
      visual={
        noData ? null : (
          <WidgetViewTabs
            label={viewLabel}
            views={views.map((view) => ({
              id: view.id,
              label: view.label,
              content: view.render(reading.value),
              isEmpty: false,
              empty,
            }))}
            selectedKey={selected}
            onSelectionChange={setSelected}
          />
        )
      }
    />
  );
}

function VisualizationWidgetContent({
  title,
  description,
  visual,
  loading = false,
  insight,
  action,
  evidence,
  status,
  empty,
  ...props
}: UnboundVisualizationWidgetProps) {
  if (loading) return <ContentSkeleton variant="panel" className={props.className} />;
  return (
    <DataPanel
      {...props}
      title={title}
      description={description}
      action={action}
      status={status}
      about={evidence}
      empty={empty}
      footer={insight}
    >
      <div className="altertable-visualization-widget-content">{visual}</div>
    </DataPanel>
  );
}
