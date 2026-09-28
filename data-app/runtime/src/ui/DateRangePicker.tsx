import { useState, type ComponentProps, type ReactNode } from "react";
import { parseDate, today, type CalendarDate } from "@internationalized/date";
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarMonthPicker,
  CalendarYearPicker,
  DateInput,
  DateRangePicker as AriaDateRangePicker,
  DateSegment,
  Dialog,
  Group,
  ListBox,
  ListBoxItem,
  Popover,
  RangeCalendar,
  Select,
  SelectValue,
  type RangeValue,
} from "react-aria-components";
import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import "./DateRangePicker.css";

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
type DatePreset = { id: DatePresetId; label: string; range: DateRange };

function monday(date: CalendarDate): CalendarDate {
  return date.subtract({ days: (date.toDate("UTC").getUTCDay() + 6) % 7 });
}

function withinBounds(
  range: DateRange,
  minDate?: string,
  maxDate?: string,
  maxRangeDays?: number,
): boolean {
  try {
    const start = parseDate(range.start);
    const end = parseDate(range.end);
    const days = (end.toDate("UTC").getTime() - start.toDate("UTC").getTime()) / 86_400_000 + 1;
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
}: Pick<DateRangePickerProps, "minDate" | "maxDate" | "maxRangeDays" | "timeZone">): DatePreset[] {
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

export type DateRangePickerProps = {
  label?: string;
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  minDate?: string;
  maxDate?: string;
  maxRangeDays?: number;
  timeZone?: string;
  /** Used to display the reset affordance. The app variable owns the URL and reset meaning. */
  resetValue?: DateRange;
  isDefault?: boolean;
  onReset?: () => void;
  onPresetChange?: (id: DatePresetId) => void;
  selectedPresetId?: DatePresetId | null;
  calendarFooter?: ReactNode;
} & Omit<
  ComponentProps<typeof AriaDateRangePicker<CalendarDate>>,
  | "children"
  | "value"
  | "onChange"
  | "minValue"
  | "maxValue"
  | "isOpen"
  | "onOpenChange"
  | "defaultValue"
  | "defaultOpen"
>;

/** The app owns URL state; `dateRangeControl` binds a date variable to this picker. */
export function DateRangePicker({
  label = "Date range",
  value,
  onChange,
  minDate,
  maxDate,
  maxRangeDays,
  timeZone,
  resetValue,
  isDefault,
  onReset,
  onPresetChange,
  selectedPresetId,
  calendarFooter,
  className,
  ...props
}: DateRangePickerProps) {
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const selected: RangeValue<CalendarDate> | null = value
    ? { start: parseDate(value.start), end: parseDate(value.end) }
    : null;
  const presets = availableDatePresets({ minDate, maxDate, maxRangeDays, timeZone });
  function choosePreset(preset: DatePreset) {
    setError("");
    if (onPresetChange) onPresetChange(preset.id);
    else onChange(preset.range);
    setOpen(false);
  }
  return (
    <AriaDateRangePicker
      {...props}
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError("");
      }}
      aria-label={props["aria-label"] ?? label}
      className={(values) =>
        classNames(
          "altertable-date-range",
          typeof className === "function" ? className(values) : className,
        )
      }
      value={selected}
      onChange={(range) => {
        const next = range ? { start: range.start.toString(), end: range.end.toString() } : null;
        if (next && !withinBounds(next, minDate, maxDate, maxRangeDays)) {
          setError(
            maxRangeDays
              ? `Choose up to ${maxRangeDays} available days.`
              : "Choose dates within the available range.",
          );
          return;
        }
        setError("");
        onChange(next);
      }}
      minValue={minDate ? parseDate(minDate) : undefined}
      maxValue={maxDate ? parseDate(maxDate) : undefined}
    >
      <Group>
        <DateInput slot="start">{(segment) => <DateSegment segment={segment} />}</DateInput>
        <span aria-hidden="true">–</span>
        <DateInput slot="end">{(segment) => <DateSegment segment={segment} />}</DateInput>
        {(onReset || resetValue) &&
          value &&
          !(
            isDefault ??
            (resetValue && value.start === resetValue.start && value.end === resetValue.end)
          ) && (
            <button
              type="button"
              className="altertable-date-range-reset"
              aria-label="Reset date range"
              onClick={() => (onReset ? onReset() : onChange(resetValue ?? null))}
            >
              <AppIcon name="reset" size={14} />
            </button>
          )}
        <Button aria-label="Choose dates">
          <AppIcon name="calendar" size={16} />
        </Button>
      </Group>
      {error && (
        <span className="altertable-date-range-error" role="alert">
          {error}
        </span>
      )}
      <Popover className="altertable-date-range-popover">
        <Dialog>
          <div className="altertable-date-range-content">
            {presets.length > 0 && (
              <div
                className="altertable-date-range-presets"
                role="group"
                aria-label="Quick date ranges"
              >
                <span className="altertable-date-range-heading">Quick ranges</span>
                {presets.map((preset) => (
                  <Button
                    key={preset.id}
                    className="altertable-date-range-preset"
                    aria-current={
                      (
                        selectedPresetId === undefined
                          ? value?.start === preset.range.start && value?.end === preset.range.end
                          : selectedPresetId === preset.id
                      )
                        ? "true"
                        : undefined
                    }
                    onPress={() => choosePreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
            <div className="altertable-date-range-custom">
              <span className="altertable-date-range-heading">Custom range</span>
              <RangeCalendar
                isDateUnavailable={(date, anchorDate) =>
                  !!maxRangeDays &&
                  !!anchorDate &&
                  Math.abs(date.toDate("UTC").getTime() - anchorDate.toDate("UTC").getTime()) >=
                    maxRangeDays * 86_400_000
                }
              >
                <header>
                  <Button slot="previous" aria-label="Previous month">
                    <AppIcon name="previousMonth" size={16} />
                  </Button>
                  <CalendarMonthPicker format="short">
                    {(picker) => (
                      <Select
                        aria-label={picker["aria-label"]}
                        selectedKey={String(picker.value)}
                        onSelectionChange={(key) => picker.onChange(Number(key))}
                        className="altertable-calendar-select"
                      >
                        <Button>
                          <SelectValue />
                          <AppIcon name="disclosure" size={14} />
                        </Button>
                        <Popover
                          className="altertable-calendar-select-popover"
                          placement="bottom start"
                        >
                          <ListBox items={picker.items}>
                            {(month) => (
                              <ListBoxItem id={String(month.id)} textValue={month.formatted}>
                                {month.formatted}
                              </ListBoxItem>
                            )}
                          </ListBox>
                        </Popover>
                      </Select>
                    )}
                  </CalendarMonthPicker>
                  <CalendarYearPicker>
                    {(picker) => (
                      <Select
                        aria-label={picker["aria-label"]}
                        selectedKey={String(picker.value)}
                        onSelectionChange={(key) => picker.onChange(Number(key))}
                        className="altertable-calendar-select"
                      >
                        <Button>
                          <SelectValue />
                          <AppIcon name="disclosure" size={14} />
                        </Button>
                        <Popover
                          className="altertable-calendar-select-popover"
                          placement="bottom start"
                        >
                          <ListBox items={picker.items}>
                            {(year) => (
                              <ListBoxItem id={String(year.id)} textValue={year.formatted}>
                                {year.formatted}
                              </ListBoxItem>
                            )}
                          </ListBox>
                        </Popover>
                      </Select>
                    )}
                  </CalendarYearPicker>
                  <Button slot="next" aria-label="Next month">
                    <AppIcon name="nextMonth" size={16} />
                  </Button>
                </header>
                <CalendarGrid>
                  <CalendarGridHeader>
                    {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
                  </CalendarGridHeader>
                  <CalendarGridBody>{(date) => <CalendarCell date={date} />}</CalendarGridBody>
                </CalendarGrid>
              </RangeCalendar>
              <div className="altertable-date-range-footer">
                <span>
                  {value ? `${value.start} – ${value.end}` : "Select a start and end date"}
                </span>
              </div>
            </div>
          </div>
          {calendarFooter}
        </Dialog>
      </Popover>
    </AriaDateRangePicker>
  );
}
