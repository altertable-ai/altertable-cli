import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import { DataWidget, type DataWidgetProps } from "./DataWidget.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import type { DataReading } from "../../core/reading.ts";
import { ContentSkeleton, type ContentSkeletonProps } from "./ContentSkeleton.tsx";
import { WidgetViewTabs } from "./WidgetViewTabs.tsx";
import "./VisualizationWidget.css";

type VisualizationWidgetBaseProps = {
  title: ReactNode;
  description?: ReactNode;
  insight?: ReactNode;
  action?: ReactNode;
  evidence?: WidgetEvidence;
  status?: DataWidgetProps["status"];
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
  evidence: WidgetEvidence;
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
    const { reading, children, isEmpty, empty, skeleton, insight, ...shell } = props;
    return (
      <DataWidget
        {...shell}
        reading={reading}
        isEmpty={isEmpty}
        empty={empty}
        skeleton={skeleton}
        footer={insight}
      >
        {(data) => <div className="altertable-visualization-widget-content">{children(data)}</div>}
      </DataWidget>
    );
  }
  const { visual, loading = false, insight, ...shell } = props;
  if (loading) return <ContentSkeleton variant="panel" className={shell.className} />;
  return (
    <DataWidget {...shell} footer={insight}>
      <div className="altertable-visualization-widget-content">{visual}</div>
    </DataWidget>
  );
}

function VisualizationWidgetWithViews<Data>({
  reading,
  views,
  viewLabel,
  initialView,
  isEmpty,
  empty,
  skeleton,
  insight,
  ...shell
}: BoundVisualizationWidgetBase<Data> & {
  views: readonly VisualizationWidgetView<Data>[];
  viewLabel: string;
  initialView?: string;
}) {
  const [selected, setSelected] = useState(initialView ?? views[0]?.id ?? "");
  return (
    <DataWidget
      {...shell}
      reading={reading}
      isEmpty={isEmpty}
      empty={empty}
      skeleton={skeleton}
      footer={insight}
    >
      {(data) => (
        <div className="altertable-visualization-widget-content">
          <WidgetViewTabs
            label={viewLabel}
            views={views.map((view) => ({
              id: view.id,
              label: view.label,
              content: view.render(data),
              isEmpty: false,
              empty,
            }))}
            selectedKey={selected}
            onSelectionChange={setSelected}
          />
        </div>
      )}
    </DataWidget>
  );
}
