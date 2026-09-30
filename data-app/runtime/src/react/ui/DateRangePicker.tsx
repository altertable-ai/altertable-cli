import { useState, type ComponentProps, type ReactNode } from "react";
import { parseDate, type CalendarDate } from "@internationalized/date";
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
import { formatDateRange, pluralize } from "../../core/format.ts";
import { Checkbox } from "./Checkbox.tsx";
import "./DateRangePicker.css";

import {
  availableDatePresets,
  inclusiveDays,
  withinBounds,
  type DatePreset,
  type DatePresetId,
  type DateRange,
} from "../../core/date-range.ts";
export type { DatePresetId, DateRange } from "../../core/date-range.ts";

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
  comparison?: {
    enabled: boolean;
    range: DateRange | null;
    onChange: (enabled: boolean) => void;
  };
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
  comparison,
  className,
  ...props
}: DateRangePickerProps) {
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const selected: RangeValue<CalendarDate> | null = value
    ? { start: parseDate(value.start), end: parseDate(value.end) }
    : null;
  const presets = availableDatePresets({ minDate, maxDate, maxRangeDays, timeZone });
  const selectedDays = value ? inclusiveDays(value) : 0;
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
      aria-label={`${props["aria-label"] ?? label}${comparison?.enabled ? ", compared with previous period" : ""}`}
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
        {comparison?.enabled && <span className="altertable-date-range-comparison">vs prior</span>}
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
              <fieldset className="altertable-date-range-presets">
                <legend className="altertable-date-range-heading">Quick ranges</legend>
                <div className="altertable-date-range-preset-list">
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
              </fieldset>
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
                <div>
                  <span className="altertable-date-range-footer-label">Selected dates</span>
                  <strong>{value ? formatDateRange(value) : "Select a start and end date"}</strong>
                </div>
                {value && (
                  <span className="altertable-date-range-footer-meta">
                    {selectedDays} {pluralize(selectedDays, "day")}
                    {timeZone ? ` · ${timeZone}` : ""}
                  </span>
                )}
              </div>
              {comparison && (
                <Checkbox
                  className="altertable-date-range-compare"
                  label="Compare with previous period"
                  checked={comparison.enabled}
                  disabled={!comparison.range}
                  onChange={comparison.onChange}
                  description={comparison.range && formatDateRange(comparison.range)}
                />
              )}
            </div>
          </div>
          {calendarFooter}
        </Dialog>
      </Popover>
    </AriaDateRangePicker>
  );
}
