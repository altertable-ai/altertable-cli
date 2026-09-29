import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import type { CardEvidence } from "./CardEvidence.ts";
import { DataPanel, type DataPanelProps } from "./DataPanel.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import type { DataReading } from "../reading.ts";
import { ContentSkeleton, type ContentSkeletonProps } from "./ContentSkeleton.tsx";
import { CardViewTabs } from "./CardViewTabs.tsx";
import "./VisualizationCard.css";

type VisualizationCardBaseProps = {
  title: ReactNode;
  description?: ReactNode;
  insight?: ReactNode;
  action?: ReactNode;
  evidence?: CardEvidence;
  /** Status for a secondary request shown beside this card's heading. */
  status?: DataPanelProps["status"];
  /** Valid result with nothing to draw, such as no rows matching a local filter. */
  empty?: Pick<EmptyStateProps, "title" | "description">;
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

type UnboundVisualizationCardProps = VisualizationCardBaseProps &
  ({ loading: true; visual?: never } | { loading?: false; visual: ReactNode });

export type VisualizationCardView<Data> = {
  id: string;
  label: ReactNode;
  render: (data: Data) => ReactNode;
};

type BoundVisualizationCardBase<Data> = VisualizationCardBaseProps & {
  reading: DataReading<Data>;
  isEmpty: (data: Data) => boolean;
  empty: Pick<EmptyStateProps, "title" | "description">;
  skeleton?: Pick<ContentSkeletonProps, "variant" | "rows">;
  visual?: never;
  loading?: never;
};

export type VisualizationCardProps<Data = unknown> =
  | UnboundVisualizationCardProps
  | (BoundVisualizationCardBase<Data> & { children: (data: Data) => ReactNode; views?: never })
  | (BoundVisualizationCardBase<Data> & {
      views: readonly VisualizationCardView<Data>[];
      viewLabel: string;
      initialView?: string;
      children?: never;
    });

export function VisualizationCard<Data>(props: VisualizationCardProps<Data>) {
  if ("views" in props && props.views) return <VisualizationCardWithViews {...props} />;
  if ("reading" in props) {
    const { reading, children, isEmpty, empty, skeleton, ...rest } = props;
    if (reading.loading)
      return <ContentSkeleton variant="panel" {...skeleton} className={rest.className} />;
    const noData = isEmpty(reading.value);
    return (
      <VisualizationCardContent
        {...rest}
        empty={noData ? empty : undefined}
        visual={noData ? null : children(reading.value)}
      />
    );
  }
  return <VisualizationCardContent {...props} />;
}

function VisualizationCardWithViews<Data>({
  reading,
  views,
  viewLabel,
  initialView,
  isEmpty,
  empty,
  skeleton,
  ...rest
}: BoundVisualizationCardBase<Data> & {
  views: readonly VisualizationCardView<Data>[];
  viewLabel: string;
  initialView?: string;
}) {
  const [selected, setSelected] = useState(initialView ?? views[0]?.id ?? "");
  if (reading.loading)
    return <ContentSkeleton variant="panel" {...skeleton} className={rest.className} />;
  const noData = isEmpty(reading.value);
  return (
    <VisualizationCardContent
      {...rest}
      empty={noData ? empty : undefined}
      visual={
        noData ? null : (
          <CardViewTabs
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

function VisualizationCardContent({
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
}: UnboundVisualizationCardProps) {
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
      <div className="altertable-visualization-card-content">{visual}</div>
    </DataPanel>
  );
}
