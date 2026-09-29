import type { DateRangeRequest } from "../contract.ts";
import { formatDateRange, formatMetric, type MetricFormat } from "../format.ts";

export type MetricComparison = {
  current: { value: number; display: string; period?: string };
  previous?: { value: number | null; display: string; period?: string };
  goodWhen?: "up" | "down";
};

/** Label a comparison from the input that produced the displayed result. Null means the
 * requested previous period has no comparable value; zero remains a measured value. */
export function calendarMetricComparison(
  displayedInput: DateRangeRequest,
  values: {
    current: number;
    previous: number | null;
    format: MetricFormat;
    goodWhen?: MetricComparison["goodWhen"];
  },
): MetricComparison | undefined {
  if (!displayedInput.comparison) return undefined;
  return {
    current: {
      value: values.current,
      display: formatMetric(values.current, values.format),
      period: formatDateRange(displayedInput.range),
    },
    previous: {
      value: values.previous,
      display:
        values.previous === null ? "Not available" : formatMetric(values.previous, values.format),
      period: formatDateRange(displayedInput.comparison),
    },
    goodWhen: values.goodWhen,
  };
}

/** A zero or missing baseline has no meaningful relative percentage. */
export function comparisonChange({ current, previous, goodWhen }: MetricComparison) {
  const percent = previous?.value ? (current.value / previous.value - 1) * 100 : null;
  const direction =
    percent === null || Math.abs(percent) < 0.05 ? "flat" : percent > 0 ? "up" : "down";
  const tone =
    direction === "flat" || !goodWhen ? "neutral" : direction === goodWhen ? "good" : "bad";
  const icon = direction === "up" ? "trendUp" : direction === "down" ? "trendDown" : "trendFlat";
  return { percent, direction, tone, icon } as const;
}
