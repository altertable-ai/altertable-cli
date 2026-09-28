import type { ComponentPropsWithRef, ReactNode } from "react";
import type { CardEvidence } from "./CardEvidence.ts";
import { DataPanel } from "./DataPanel.tsx";
import { DataTable, DataTableEmptyRow, type DataTableSearch } from "./DataTable.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import { searchItems, type SearchHit, type SearchItemsOptions } from "./searchItems.ts";
import "./TableCard.css";

export type TableCardColumn<Row> = {
  id: string;
  header: ReactNode;
  type?: "number" | "datetime";
  /** Render this column's value for one row. The table owns its cell element and semantics. */
  cell: (row: Row, hit?: SearchHit<Row>) => ReactNode;
};

export type TableCardSearch<Row> = Omit<DataTableSearch, "itemCount"> &
  Pick<SearchItemsOptions<Row>, "attributes" | "mode" | "fuzzyThreshold">;

export type TableCardProps<Row> = {
  title: ReactNode;
  count?: number;
  description?: ReactNode;
  columns: readonly [TableCardColumn<Row>, ...TableCardColumn<Row>[]];
  rows: readonly Row[];
  rowKey: (row: Row) => string | number;
  insight?: ReactNode;
  action?: ReactNode;
  evidence?: CardEvidence;
  search?: TableCardSearch<Row>;
  limit?: number;
  /** Valid result with no rows; the header remains visible. */
  empty: Pick<EmptyStateProps, "title" | "description">;
} & Omit<ComponentPropsWithRef<"section">, "about" | "title" | "children">;

/** Column definitions own both header and body semantics; the first column is the row header. */
export function TableCard<Row>({
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
  empty,
  ...props
}: TableCardProps<Row>) {
  const hits = search
    ? searchItems(rows, search.value, {
        attributes: search.attributes,
        mode: search.mode,
        fuzzyThreshold: search.fuzzyThreshold,
      })
    : rows.map((item) => ({ item, score: 0, matches: {} }));
  const visible = hits.slice(0, Math.max(0, limit ?? hits.length));
  const searchable = search && {
    label: search.label,
    placeholder: search.placeholder,
    value: search.value,
    onChange: search.onChange,
    resetValue: search.resetValue,
    itemCount: rows.length,
  };
  const table = (
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
      <div className="altertable-table-card-content">{table}</div>
    </DataPanel>
  );
}
