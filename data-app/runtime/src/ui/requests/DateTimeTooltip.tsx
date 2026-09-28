import { useEffect, useState, type ReactNode } from "react";
import { HelpPopover, type HelpPopoverProps } from "../primitives/HelpPopover.tsx";
import "./DateTimeTooltip.css";

export type DateTimeTooltipProps = {
  /** The instant to explain. */
  date: Date;
  /** Optional viewer time zone, such as "Europe/Paris". */
  timeZone?: string;
  children?: ReactNode;
} & Omit<HelpPopoverProps, "trigger" | "triggerLabel" | "label" | "children">;

function formattedDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function relativeDate(date: Date, now: number): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  const absolute = Math.abs(seconds);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absolute < 60
      ? [seconds, "second"]
      : absolute < 3600
        ? [Math.round(seconds / 60), "minute"]
        : absolute < 86_400
          ? [Math.round(seconds / 3600), "hour"]
          : [Math.round(seconds / 86_400), "day"];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(value, unit);
}

/** Reveal an interactive date popover on hover or click with local, UTC, relative,
 * and Unix time. Pass the viewer's account timeZone when known. */
export function DateTimeTooltip({
  date,
  timeZone,
  children,
  triggerClassName,
  panelClassName,
  ...props
}: DateTimeTooltipProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const primaryTimeZone = timeZone ?? browserTimeZone;
  const rows = [
    {
      label: timeZone ? `Account · ${timeZone}` : `Browser · ${browserTimeZone}`,
      zone: primaryTimeZone,
    },
    ...(primaryTimeZone === "UTC" ? [] : [{ label: "UTC", zone: "UTC" }]),
    ...(timeZone && timeZone !== browserTimeZone
      ? [{ label: `Browser · ${browserTimeZone}`, zone: browserTimeZone }]
      : []),
  ];
  const timestamp = date.toISOString();
  return (
    <HelpPopover
      {...props}
      placement={props.placement ?? "bottom"}
      triggerClassName={triggerClassName}
      panelClassName={["altertable-date-time-tooltip", panelClassName].filter(Boolean).join(" ")}
      triggerLabel="Show exact date and time"
      label="Date and time details"
      trigger={
        children ?? (
          <time dateTime={timestamp}>{formattedDate(date, timeZone ?? browserTimeZone)}</time>
        )
      }
    >
      <div className="altertable-date-time-rows">
        {rows.map(({ label, zone }) => (
          <span className="altertable-date-time-row" key={label}>
            <span className="altertable-date-time-label">{label}</span>
            <time dateTime={timestamp}>{formattedDate(date, zone)}</time>
          </span>
        ))}
        <span className="altertable-date-time-row">
          <span className="altertable-date-time-label">Relative</span>
          <time dateTime={timestamp}>{relativeDate(date, now)}</time>
        </span>
        <span className="altertable-date-time-row">
          <span className="altertable-date-time-label">Timestamp</span>
          <time dateTime={timestamp}>{date.getTime()}</time>
        </span>
      </div>
    </HelpPopover>
  );
}
