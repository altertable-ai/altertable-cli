import { AppIcon } from "./icons.ts";
import { comparisonChange, type MetricComparison } from "./comparison.ts";
import "./ComparisonVisual.css";

export type ComparisonVisualProps = MetricComparison & {
  label: string;
  emphasis?: "standard" | "story";
};

/** Compare two periods with their exact values, proportional bars, and a stated change. */
export function ComparisonVisual({
  label,
  current,
  previous,
  goodWhen,
  emphasis = "standard",
}: ComparisonVisualProps) {
  const max = Math.max(current.value, previous?.value ?? 0, 1);
  const { percent, tone, icon } = comparisonChange({ current, previous, goodWhen });
  return (
    <figure
      className="altertable-comparison-visual"
      data-emphasis={emphasis}
      aria-label={`${label} comparison`}
    >
      <figcaption>{label}</figcaption>
      <div className="altertable-comparison-row" data-period="current">
        <div>
          <span>{current.period ?? "Current period"}</span>
          <strong>{current.display}</strong>
        </div>
        <span className="altertable-comparison-track">
          <span style={{ width: `${(current.value / max) * 100}%` }} />
        </span>
      </div>
      {previous && (
        <div className="altertable-comparison-row" data-period="previous">
          <div>
            <span>{previous.period ?? "Previous period"}</span>
            <strong>{previous.display}</strong>
          </div>
          <span className="altertable-comparison-track">
            <span style={{ width: `${(previous.value / max) * 100}%` }} />
          </span>
        </div>
      )}
      <p className="altertable-comparison-change" data-tone={tone}>
        {percent === null ? (
          "No comparable previous value"
        ) : (
          <>
            <AppIcon name={icon} size={17} />
            {Math.abs(percent).toFixed(1)}% vs{" "}
            {previous?.period?.toLowerCase() ?? "previous period"}
          </>
        )}
      </p>
    </figure>
  );
}
