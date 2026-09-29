import type { DateRangeRequest } from "../../core/contract.ts";
import { formatDateRange, formatMetric, type MetricFormat } from "../../core/format.ts";

export type MetricComparison = {
  current: { value: number; formattedValue: string; periodLabel?: string };
  previous?: { value: number | null; formattedValue: string; periodLabel?: string };
  favorableDirection?: "up" | "down";
};

/** Label a comparison from the input that produced the displayed result. Null means the
 * requested previous period has no comparable value; zero remains a measured value. */
export function calendarMetricComparison(
  displayedInput: DateRangeRequest,
  values: {
    current: number;
    previous: number | null;
    format: MetricFormat;
    favorableDirection?: MetricComparison["favorableDirection"];
  },
): MetricComparison | undefined {
  if (!displayedInput.comparison) return undefined;
  return {
    current: {
      value: values.current,
      formattedValue: formatMetric(values.current, values.format),
      periodLabel: formatDateRange(displayedInput.range),
    },
    previous: {
      value: values.previous,
      formattedValue:
        values.previous === null ? "Not available" : formatMetric(values.previous, values.format),
      periodLabel: formatDateRange(displayedInput.comparison),
    },
    favorableDirection: values.favorableDirection,
  };
}

/** A zero or missing baseline has no meaningful relative percentage. */
export function comparisonChange({ current, previous, favorableDirection }: MetricComparison) {
  const percent = previous?.value ? (current.value / previous.value - 1) * 100 : null;
  const direction =
    percent === null || Math.abs(percent) < 0.05 ? "flat" : percent > 0 ? "up" : "down";
  const tone =
    direction === "flat" || !favorableDirection
      ? "neutral"
      : direction === favorableDirection
        ? "good"
        : "bad";
  const icon = direction === "up" ? "trendUp" : direction === "down" ? "trendDown" : "trendFlat";
  return { percent, direction, tone, icon } as const;
}
