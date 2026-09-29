import type { MetricFormat } from "../format.ts";
import type { CardEvidence } from "./CardEvidence.ts";
import type { MetricReading } from "../reading.ts";
import { calendarMetricComparison } from "./comparison.ts";

export type MetricDefinition = {
  id: string;
  label: string;
  format: MetricFormat;
  goodWhen?: "up" | "down";
  evidence: CardEvidence;
};

export function metricComparison(metric: MetricDefinition, reading: MetricReading) {
  if (reading.loading || !reading.value.period) return undefined;
  return calendarMetricComparison(reading.value.period, {
    current: reading.value.current,
    previous: reading.value.previous ?? null,
    format: metric.format,
    goodWhen: metric.goodWhen,
  });
}
