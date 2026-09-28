import type { ComponentPropsWithRef, ReactNode } from "react";
import type { CardEvidence } from "./CardEvidence.ts";
import { DataPanel, type DataPanelProps } from "./DataPanel.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
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

export type VisualizationCardProps = VisualizationCardBaseProps &
  ({ loading: true; visual?: never } | { loading?: false; visual: ReactNode });

export function VisualizationCard({
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
}: VisualizationCardProps) {
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
