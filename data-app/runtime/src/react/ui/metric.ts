import type { MetricFormat } from "../../core/format.ts";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import type { MetricReading } from "../../core/reading.ts";
import { calendarMetricComparison } from "./comparison.ts";

export type MetricDefinition = {
  id: string;
  label: string;
  format: MetricFormat;
  favorableDirection?: "up" | "down";
  evidence: WidgetEvidence;
};

export function metricComparison(metric: MetricDefinition, reading: MetricReading) {
  if (reading.loading || !reading.value.period) return undefined;
  return calendarMetricComparison(reading.value.period, {
    current: reading.value.current,
    previous: reading.value.previous ?? null,
    format: metric.format,
    favorableDirection: metric.favorableDirection,
  });
}
