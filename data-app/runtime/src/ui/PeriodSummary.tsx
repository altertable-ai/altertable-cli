import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import "./PeriodSummary.css";

/** A rolling window has an exact endpoint; a calendar range names whole dates in a time zone. */
export type ReportingPeriod =
  | { kind: "rolling"; amount: number; unit: "hour" | "day"; end: string }
  | { kind: "calendar"; start: string; end: string; timeZone: string };

export type PeriodComparison = { kind: "previous" } | { kind: "period"; period: ReportingPeriod };

export type PeriodSummaryProps = {
  period: ReportingPeriod;
  comparison?: PeriodComparison;
  className?: string;
};

function duration(period: Extract<ReportingPeriod, { kind: "rolling" }>): string {
  return `${period.amount} ${period.unit}${period.amount === 1 ? "" : "s"}`;
}

function label(period: ReportingPeriod): string {
  if (period.kind === "rolling") return `Last ${duration(period)}`;
  return period.start === period.end ? period.start : `${period.start} – ${period.end}`;
}

function comparisonLabel(period: ReportingPeriod, comparison: PeriodComparison): string {
  if (comparison.kind === "period") {
    if (comparison.period.kind === "calendar") return label(comparison.period);
    return `${duration(comparison.period)} ending ${new Date(comparison.period.end).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  }
  return period.kind === "rolling" ? `Previous ${duration(period)}` : "Previous period";
}

function detail(period: ReportingPeriod): string {
  if (period.kind === "calendar") return `${label(period)} in ${period.timeZone}`;
  const end = new Date(period.end);
  if (Number.isNaN(end.getTime())) return label(period);
  const start = new Date(
    end.getTime() - period.amount * (period.unit === "hour" ? 3_600_000 : 86_400_000),
  );
  return `${label(period)}, ${start.toISOString()} to ${end.toISOString()}`;
}

/** Read-only period context for the variable bar. The accessible name includes exact bounds. */
export function PeriodSummary({ period, comparison, className }: PeriodSummaryProps) {
  const comparisonText = comparison ? comparisonLabel(period, comparison) : null;
  const comparisonDetail =
    comparison?.kind === "period" ? detail(comparison.period) : comparisonText;
  return (
    <div
      className={classNames("altertable-period-summary", className)}
      role="group"
      aria-label={`Reporting period: ${detail(period)}${comparisonDetail ? `, compared with ${comparisonDetail}` : ""}`}
    >
      <AppIcon name={period.kind === "rolling" ? "clock" : "calendar"} size={16} />
      <span className="altertable-period-summary-current">{label(period)}</span>
      {comparisonText && (
        <>
          <span className="altertable-period-summary-vs" aria-hidden="true">
            vs
          </span>
          <span>{comparisonText}</span>
        </>
      )}
    </div>
  );
}
