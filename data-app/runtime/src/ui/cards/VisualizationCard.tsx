import type { ComponentPropsWithRef, ReactNode } from "react";
import type { CardEvidence } from "./CardEvidence.ts";
import { DataPanel, type DataPanelProps } from "./DataPanel.tsx";
import type { EmptyStateProps } from "../requests/EmptyState.tsx";
import "./VisualizationCard.css";

export type VisualizationCardProps = {
  title: ReactNode;
  description?: ReactNode;
  visual: ReactNode;
  insight?: ReactNode;
  action?: ReactNode;
  evidence?: CardEvidence;
  /** Status for a secondary request shown beside this card's heading. */
  status?: DataPanelProps["status"];
  /** Valid result with nothing to draw, such as no rows matching a local filter. */
  empty?: Pick<EmptyStateProps, "title" | "description">;
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/** A titled chart or ranking with named visual, interpretation, and inspect slots. */
export function VisualizationCard({
  title,
  description,
  visual,
  insight,
  action,
  evidence,
  status,
  empty,
  ...props
}: VisualizationCardProps) {
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
