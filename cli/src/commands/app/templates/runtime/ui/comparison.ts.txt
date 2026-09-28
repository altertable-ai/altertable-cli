export type MetricComparison = {
  current: { value: number; display: string; period?: string };
  previous?: { value: number; display: string; period?: string };
  goodWhen?: "up" | "down";
};

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
