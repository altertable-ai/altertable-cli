import type { ComponentPropsWithRef, ReactNode } from "react";
import { classNames } from "../primitives/classNames.ts";
import { DateTimeTooltip } from "../requests/DateTimeTooltip.tsx";
import { EmptyState, type EmptyStateProps } from "../requests/EmptyState.tsx";
import { SearchField, type SearchFieldProps } from "../controls/SearchField.tsx";
import "./DataTable.css";

export type DataTableSearch = Pick<
  SearchFieldProps,
  "label" | "placeholder" | "value" | "onChange" | "resetValue"
> & {
  /** Number of available records before filtering or a display limit. */
  itemCount: number;
};
export type DataTableProps = ComponentPropsWithRef<"table"> & { searchable?: DataTableSearch };

/** Scrollable native table. Mark quantitative th/td cells with data-type="number";
 * the runtime aligns them to the end and uses tabular digits. */
export function DataTable({ className, ref, searchable, ...props }: DataTableProps) {
  return (
    <>
      {searchable &&
        (searchable.itemCount > 5 || searchable.value !== (searchable.resetValue ?? "")) && (
          <SearchField
            label={searchable.label}
            placeholder={searchable.placeholder}
            value={searchable.value}
            onChange={searchable.onChange}
            resetValue={searchable.resetValue}
            size="compact"
            className="altertable-data-table-search"
          />
        )}
      <div className="altertable-data-table-scroll">
        <table {...props} ref={ref} className={classNames("altertable-data-table", className)} />
      </div>
    </>
  );
}

/** Accepts a fraction of the stated whole, using `formatPercent` semantics. */
export function DataTableShare({ value }: { value: number }) {
  const ratio = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const label = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio);
  return <span className="altertable-data-table-share">{label}</span>;
}

export type DataTableEmptyRowProps = Pick<EmptyStateProps, "title" | "description"> & {
  colSpan: number;
};

export function DataTableEmptyRow({ colSpan, title, description }: DataTableEmptyRowProps) {
  return (
    <tr className="altertable-data-table-empty-row">
      <td colSpan={colSpan}>
        <EmptyState title={title} description={description} variant="table" />
      </td>
    </tr>
  );
}

export type DataTableTimestampProps = {
  value: string | Date;
  children?: ReactNode;
  timeZone?: string;
};

export function DataTableTimestamp({ value, children, timeZone }: DataTableTimestampProps) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <>{children ?? value.toString()}</>;
  const timestamp = date.toISOString();
  return (
    <DateTimeTooltip
      date={date}
      timeZone={timeZone}
      triggerClassName="altertable-data-table-timestamp"
    >
      <time dateTime={timestamp}>{children ?? timestamp}</time>
    </DateTimeTooltip>
  );
}
