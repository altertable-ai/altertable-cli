import { parseDate, today, type CalendarDate } from "@internationalized/date";

/** ISO calendar dates; the app operation defines timezone and inclusive bounds. */
export type DateRange = { start: string; end: string };

export type DatePresetId =
  | "day"
  | "last-3"
  | "last-7"
  | "last-14"
  | "last-30"
  | "last-90"
  | "this-week"
  | "previous-week"
  | "this-month"
  | "previous-month";
export type DatePreset = { id: DatePresetId; label: string; range: DateRange };

export function inclusiveDays(range: DateRange): number {
  return (
    (parseDate(range.end).toDate("UTC").getTime() -
      parseDate(range.start).toDate("UTC").getTime()) /
      86_400_000 +
    1
  );
}

function monday(date: CalendarDate): CalendarDate {
  return date.subtract({ days: (date.toDate("UTC").getUTCDay() + 6) % 7 });
}

export function withinBounds(
  range: DateRange,
  minDate?: string,
  maxDate?: string,
  maxRangeDays?: number,
): boolean {
  try {
    const start = parseDate(range.start);
    const end = parseDate(range.end);
    const days = inclusiveDays(range);
    return (
      days >= 1 &&
      (!maxRangeDays || days <= maxRangeDays) &&
      (!minDate || start.compare(parseDate(minDate)) >= 0) &&
      (!maxDate || end.compare(parseDate(maxDate)) <= 0)
    );
  } catch {
    return false;
  }
}

/** Only offer ranges the app says it can query. Dates and range lengths are inclusive. */
export function availableDatePresets({
  minDate,
  maxDate,
  maxRangeDays,
  timeZone = "UTC",
}: {
  minDate?: string;
  maxDate?: string;
  maxRangeDays?: number;
  timeZone?: string;
}): DatePreset[] {
  const currentDay = today(timeZone);
  const latest =
    maxDate && parseDate(maxDate).compare(currentDay) < 0 ? parseDate(maxDate) : currentDay;
  const earliest = minDate ? parseDate(minDate) : null;
  const completeDays = latest.compare(currentDay.subtract({ days: 1 })) === 0;
  const historical = latest.compare(currentDay.subtract({ days: 1 })) < 0;
  const options: DatePreset[] = [];
  const seen = new Set<string>();
  function add(id: DatePresetId, label: string, start: CalendarDate, end = latest) {
    const days = (end.toDate("UTC").getTime() - start.toDate("UTC").getTime()) / 86_400_000 + 1;
    const range = { start: start.toString(), end: end.toString() };
    const key = `${range.start}/${range.end}`;
    if (
      days < 1 ||
      (maxRangeDays && days > maxRangeDays) ||
      (earliest && start.compare(earliest) < 0) ||
      end.compare(latest) > 0 ||
      seen.has(key)
    )
      return;
    seen.add(key);
    options.push({ id, label, range });
  }
  add("day", historical ? "Latest available day" : completeDays ? "Yesterday" : "Today", latest);
  for (const days of [3, 7, 14, 30, 90]) {
    add(
      `last-${days}` as DatePresetId,
      historical
        ? `Latest ${days} available days`
        : completeDays
          ? `Last ${days} complete days`
          : `Last ${days} days`,
      latest.subtract({ days: days - 1 }),
    );
  }
  const weekStart = monday(currentDay);
  if (latest.compare(weekStart) >= 0)
    add("this-week", completeDays ? "This week through yesterday" : "This week", weekStart);
  add(
    "previous-week",
    "Previous week",
    weekStart.subtract({ days: 7 }),
    weekStart.subtract({ days: 1 }),
  );
  const monthStart = currentDay.set({ day: 1 });
  if (latest.compare(monthStart) >= 0)
    add("this-month", completeDays ? "This month through yesterday" : "This month", monthStart);
  const previousMonthEnd = monthStart.subtract({ days: 1 });
  add("previous-month", "Previous month", previousMonthEnd.set({ day: 1 }), previousMonthEnd);
  return options;
}
