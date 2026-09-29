import type { ComponentPropsWithRef, ReactNode } from "react";
import type { CardEvidence } from "./CardEvidence.ts";
import { DataPanel, type DataPanelProps } from "./DataPanel.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import type { DataReading } from "../reading.ts";
import { ContentSkeleton, type ContentSkeletonProps } from "./ContentSkeleton.tsx";
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

export type VisualizationCardProps<Data = unknown> =
  | UnboundVisualizationCardProps
  | (VisualizationCardBaseProps & {
      reading: DataReading<Data>;
      children: (data: Data) => ReactNode;
      isEmpty: (data: Data) => boolean;
      empty: Pick<EmptyStateProps, "title" | "description">;
      skeleton?: Pick<ContentSkeletonProps, "variant" | "rows">;
      visual?: never;
      loading?: never;
    });

export function VisualizationCard<Data>(props: VisualizationCardProps<Data>) {
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
