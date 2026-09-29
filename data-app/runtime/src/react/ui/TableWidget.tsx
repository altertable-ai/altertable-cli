import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { invariant } from "../../core/invariant.ts";
import type { WidgetEvidence } from "./WidgetEvidence.ts";
import { DataPanel } from "./DataPanel.tsx";
import { DataTable, DataTableEmptyRow, type DataTableSearch } from "./DataTable.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import { searchItems, type SearchHit, type SearchItemsOptions } from "./searchItems.ts";
import type { DataReading } from "../../core/reading.ts";
import { formatCount, pluralize } from "../../core/format.ts";
import { ContentSkeleton } from "./ContentSkeleton.tsx";
import { AppIcon } from "./icons.ts";
import { Tooltip } from "./Tooltip.tsx";
import "./TableWidget.css";

export type TableWidgetColumn<Row> = {
  id: string;
  header: ReactNode;
  type?: "number" | "datetime";
  /** Render this column's value for one row. The table owns its cell element and semantics. */
  cell: (row: Row, hit?: SearchHit<Row>) => ReactNode;
};

export type TableWidgetSearch<Row> = Omit<DataTableSearch, "itemCount"> &
  Pick<SearchItemsOptions<Row>, "attributes" | "mode" | "fuzzyThreshold">;

type TableWidgetBaseProps<Row> = {
  title: ReactNode;
  count?: number;
  description?: ReactNode;
  columns: readonly [TableWidgetColumn<Row>, ...TableWidgetColumn<Row>[]];
  rowKey: (row: Row) => string | number;
  insight?: ReactNode;
  action?: ReactNode;
  evidence?: WidgetEvidence;
  search?: TableWidgetSearch<Row>;
  /** Valid result with no rows; the header remains visible. */
  empty: Pick<EmptyStateProps, "title" | "description">;
} & (
  | { limit?: number; pagination?: never }
  | {
      /** Paginate the supplied, bounded rows after local search. */
      pagination: { pageSize: number };
      limit?: never;
    }
) &
  Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/** Column definitions own both header and body semantics; the first column is the row header. */
export type TableWidgetProps<Row> = TableWidgetBaseProps<Row> &
  (
    | { rows: readonly Row[]; reading?: never; skeletonRows?: never }
    | {
        reading: DataReading<readonly Row[]>;
        rows?: never;
        skeletonRows?: number;
        evidence: WidgetEvidence;
      }
  );

export function TableWidget<Row>(props: TableWidgetProps<Row>) {
  if (props.reading) {
    const { reading, skeletonRows = 5, ...rest } = props;
    if (reading.loading)
      return <ContentSkeleton variant="ranking" rows={skeletonRows} className={rest.className} />;
    return <TableWidgetContent {...rest} rows={reading.value} />;
  }
  return <TableWidgetContent {...props} />;
}

function TableWidgetContent<Row>({
  title,
  count,
  description,
  columns,
  rows,
  rowKey,
  insight,
  action,
  evidence,
  search,
  limit,
  pagination,
  empty,
  ...props
}: TableWidgetBaseProps<Row> & { rows: readonly Row[] }) {
  invariant(
    !pagination || (Number.isSafeInteger(pagination.pageSize) && pagination.pageSize >= 1),
    "TableWidget pagination.pageSize must be a positive integer.",
  );
  const rowKeys = JSON.stringify(rows.map(rowKey));
  const [pageState, setPageState] = useState({ page: 0, rowKeys, searchValue: search?.value });
  if (pageState.rowKeys !== rowKeys || pageState.searchValue !== search?.value) {
    setPageState({ page: 0, rowKeys, searchValue: search?.value });
  }
  const hits = search
    ? searchItems(rows, search.value, {
        attributes: search.attributes,
        mode: search.mode,
        fuzzyThreshold: search.fuzzyThreshold,
      })
    : rows.map((item) => ({ item, score: 0, matches: {} }));
  const pageSize = pagination?.pageSize ?? null;
  const pageCount = pageSize ? Math.max(1, Math.ceil(hits.length / pageSize)) : 1;
  const page = Math.min(pageState.page, pageCount - 1);
  const start = pageSize ? page * pageSize : 0;
  const visible = hits.slice(
    start,
    pageSize ? start + pageSize : Math.max(0, limit ?? hits.length),
  );
  const searchable = search && {
    label: search.label,
    placeholder: search.placeholder,
    value: search.value,
    onChange: search.onChange,
    resetValue: search.resetValue,
    itemCount: rows.length,
  };
  const table = (
    <>
      <DataTable searchable={searchable}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" data-type={column.type}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <DataTableEmptyRow colSpan={columns.length} {...empty} />
          ) : (
            visible.map((hit) => (
              <tr key={rowKey(hit.item)}>
                {columns.map((column, index) =>
                  index === 0 ? (
                    <th key={column.id} scope="row" data-type={column.type}>
                      {column.cell(hit.item, hit)}
                    </th>
                  ) : (
                    <td key={column.id} data-type={column.type}>
                      {column.cell(hit.item, hit)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      {pageSize && hits.length > 0 && (
        <nav className="altertable-table-pagination" aria-label="Table pages">
          <span className="altertable-table-pagination-range">
            {formatCount(start + 1)}–{formatCount(start + visible.length)} of{" "}
            {formatCount(hits.length)} {pluralize(hits.length, "result")}
          </span>
          <span className="altertable-table-pagination-controls">
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <Tooltip content="Previous page">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page === 0}
                onClick={() =>
                  setPageState({ page: page - 1, rowKeys, searchValue: search?.value })
                }
              >
                <AppIcon name="previousMonth" size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Next page">
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= pageCount - 1}
                onClick={() =>
                  setPageState({ page: page + 1, rowKeys, searchValue: search?.value })
                }
              >
                <AppIcon name="nextMonth" size={16} />
              </button>
            </Tooltip>
          </span>
        </nav>
      )}
    </>
  );
  return (
    <DataPanel
      {...props}
      title={title}
      count={count}
      description={description}
      action={action}
      about={evidence && { ...evidence, visual: table }}
      footer={insight}
    >
      <div className="altertable-table-widget-content">{table}</div>
    </DataPanel>
  );
}
