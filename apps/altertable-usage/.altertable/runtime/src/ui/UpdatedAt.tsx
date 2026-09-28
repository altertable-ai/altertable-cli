import { useEffect, useState, type ReactNode } from "react";
import { DateTimeTooltip, type DateTimeTooltipProps } from "./DateTimeTooltip.tsx";
import "./UpdatedAt.css";

export type UpdatedAtProps = {
  timestamp: number;
  locale?: string;
  label?: string;
  children?: ReactNode;
} & Omit<DateTimeTooltipProps, "date" | "children">;

/** Relative observation time with an interactive exact-time popover. */
export function UpdatedAt({
  timestamp,
  locale,
  label = "Updated",
  children,
  triggerClassName,
  ...props
}: UpdatedAtProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const elapsedMinutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let age = "just now";
  if (elapsedMinutes >= 1_440) age = relative.format(-Math.floor(elapsedMinutes / 1_440), "day");
  else if (elapsedMinutes >= 60) age = relative.format(-Math.floor(elapsedMinutes / 60), "hour");
  else if (elapsedMinutes >= 1) age = relative.format(-elapsedMinutes, "minute");

  const date = new Date(timestamp);
  return (
    <DateTimeTooltip
      {...props}
      date={date}
      triggerClassName={["altertable-updated-at", triggerClassName].filter(Boolean).join(" ")}
    >
      {children ?? (
        <time dateTime={date.toISOString()}>
          {label} {age}
        </time>
      )}
    </DateTimeTooltip>
  );
}
