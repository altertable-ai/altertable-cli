import type { ComponentPropsWithRef, ReactNode } from "react";
import { AboutData } from "./AboutData.tsx";
import type { CardEvidence } from "./CardEvidence.ts";
import { AppIcon } from "./icons.ts";
import { comparisonChange, type MetricComparison } from "./comparison.ts";
import { classNames } from "./classNames.ts";
import { formatMetric, type MetricFormat } from "../format.ts";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import "./Inspect.css";
import "./MetricCard.css";

type MetricCardBaseProps = {
  label: string;
  description?: ReactNode;
  comparison?: MetricComparison;
  evidence?: CardEvidence;
  action?: ReactNode;
  insight?: ReactNode;
  visual?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "about" | "children">;

export type MetricCardProps = MetricCardBaseProps &
  (
    | { loading: true; value?: never; format?: never; content?: never }
    | ({ loading?: false } & (
        | { value: number; format: MetricFormat; content?: never }
        | { content: ReactNode; value?: never; format?: never }
      ))
  );

export function MetricCard({
  label,
  value,
  content,
  format,
  loading = false,
  description,
  comparison,
  evidence,
  action,
  insight,
  visual,
  className,
  ...props
}: MetricCardProps) {
  if (loading) return <ContentSkeleton variant="metric" className={className} />;
  const shownValue = format ? formatMetric(value as number, format) : content;
  const change = comparison ? comparisonChange(comparison) : null;
  const shownTrend =
    change?.percent != null ? (
      <span className="altertable-metric-change" data-tone={change.tone}>
        <AppIcon name={change.icon} size={14} />
        {Math.abs(change.percent).toFixed(1)}% vs{" "}
        {comparison?.previous?.period?.toLowerCase() ?? "previous period"}
      </span>
    ) : comparison?.previous?.value === null ? (
      <span className="altertable-metric-change" data-tone="neutral">
        Previous period unavailable
      </span>
    ) : null;
  const help = evidence ? (
    <AboutData
      iconOnly
      variant="ghost"
      className="altertable-inspect-trigger"
      tooltip="Explore this metric"
      {...evidence}
      shortcut={false}
      id={evidence.id}
      title={label}
      description={description}
      visual={
        <div className="altertable-metric-evidence">
          <div className="altertable-metric-reading">
            <strong className="altertable-metric-value">{shownValue}</strong>
            {shownTrend && <span className="altertable-metric-trend">{shownTrend}</span>}
          </div>
          {visual}
        </div>
      }
      visualKind="metric"
    >
      <AppIcon name="openDetails" />
    </AboutData>
  ) : null;
  return (
    <div {...props} className={classNames("altertable-metric-card", className)}>
      <div className="altertable-metric-label">
        <span>{label}</span>
        {(action || help) && (
          <div className="altertable-metric-help">
            {action}
            {help}
          </div>
        )}
      </div>
      <div className="altertable-metric-reading">
        <strong className="altertable-metric-value">{shownValue}</strong>
        {shownTrend && <span className="altertable-metric-trend">{shownTrend}</span>}
      </div>
      {description && <small className="altertable-metric-description">{description}</small>}
      {visual && <div className="altertable-metric-visual">{visual}</div>}
      {insight && <div className="altertable-metric-insight">{insight}</div>}
    </div>
  );
}
