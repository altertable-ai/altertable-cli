import type { ComponentPropsWithRef, ReactNode } from "react";
import { WidgetStatusControl, type WidgetStatus } from "./RequestHint.tsx";
import { AboutData } from "./AboutData.tsx";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import { AppIcon } from "./icons.ts";
import { comparisonChange, type MetricComparison } from "./comparison.ts";
import { classNames } from "./classNames.ts";
import { formatMetric, type MetricFormat } from "../../core/format.ts";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import type { MetricReading } from "../../core/reading.ts";
import { metricComparison, type MetricDefinition } from "./metric.ts";
import "./Inspect.css";
import "./MetricWidget.css";

type MetricWidgetBaseProps = {
  label: string;
  description?: ReactNode;
  comparison?: MetricComparison;
  evidence?: WidgetEvidence;
  action?: ReactNode;
  insight?: ReactNode;
  status?: WidgetStatus;
  visual?: ReactNode;
} & Omit<ComponentPropsWithRef<"div">, "about" | "children">;

type UnboundMetricWidgetProps = MetricWidgetBaseProps &
  (
    | { loading: true; value?: never; format?: never; content?: never }
    | ({ loading?: false } & (
        | { value: number; format: MetricFormat; content?: never }
        | { content: ReactNode; value?: never; format?: never }
      ))
  );

export type MetricWidgetProps =
  | UnboundMetricWidgetProps
  | (Omit<MetricWidgetBaseProps, "label" | "comparison" | "evidence"> & {
      metric: MetricDefinition;
      reading: MetricReading;
      label?: never;
      value?: never;
      format?: never;
      content?: never;
      comparison?: never;
      evidence?: never;
      loading?: never;
    });

export function MetricWidget(props: MetricWidgetProps) {
  if ("metric" in props) {
    const { metric, reading, ...rest } = props;
    if (reading.loading) return <MetricWidgetContent {...rest} label={metric.label} loading />;
    return (
      <MetricWidgetContent
        {...rest}
        label={metric.label}
        value={reading.value.current}
        format={metric.format}
        evidence={metric.evidence}
        comparison={metricComparison(metric, reading)}
      />
    );
  }
  return <MetricWidgetContent {...props} />;
}

function MetricWidgetContent({
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
  status,
  visual,
  className,
  ...props
}: UnboundMetricWidgetProps) {
  if (loading) return <ContentSkeleton variant="metric" className={className} />;
  const shownValue = format ? formatMetric(value as number, format) : content;
  const change = comparison ? comparisonChange(comparison) : null;
  const shownTrend =
    change?.percent != null ? (
      <span className="altertable-metric-change" data-tone={change.tone}>
        <AppIcon name={change.icon} size={14} />
        {Math.abs(change.percent).toFixed(1)}% vs{" "}
        {comparison?.previous?.periodLabel?.toLowerCase() ?? "previous period"}
      </span>
    ) : comparison?.previous?.value === null ? (
      <span className="altertable-metric-change" data-tone="neutral">
        Previous period unavailable
      </span>
    ) : null;
  const reading = (
    <div className="altertable-metric-reading">
      <strong className="altertable-metric-value">{shownValue}</strong>
      {shownTrend && <span className="altertable-metric-trend">{shownTrend}</span>}
    </div>
  );
  const visualization = visual && <div className="altertable-metric-visual">{visual}</div>;
  const feedback = <WidgetStatusControl status={status} />;
  const help = evidence ? (
    <AboutData
      iconOnly
      variant="ghost"
      className="altertable-inspect-trigger"
      tooltip="Explore this metric"
      references={{
        kind: "ids",
        glossaryIds: evidence.glossaryIds,
        queryNames: evidence.queryNames,
      }}
      shortcut={false}
      id={evidence.id}
      title={label}
      headerActions={feedback}
      description={description}
      visual={
        <div className="altertable-metric-evidence">
          {reading}
          {visualization}
        </div>
      }
      visualKind="metric"
    >
      <AppIcon name="openDetails" />
    </AboutData>
  ) : null;
  return (
    <div {...props} className={classNames("altertable-metric-widget", className)}>
      <div className="altertable-metric-label">
        <span>{label}</span>
        <div className="altertable-metric-help">
          {feedback}
          {action}
          {help}
        </div>
      </div>
      {reading}
      {description && <small className="altertable-metric-description">{description}</small>}
      {visualization}
      {insight && <div className="altertable-metric-insight">{insight}</div>}
    </div>
  );
}
