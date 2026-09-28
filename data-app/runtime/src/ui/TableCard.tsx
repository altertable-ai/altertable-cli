import type { ComponentPropsWithRef, ReactNode } from "react";
import type { CardEvidence } from "./CardEvidence.ts";
import { DataPanel } from "./DataPanel.tsx";
import { DataTable, DataTableEmptyRow, type DataTableSearch } from "./DataTable.tsx";
import type { EmptyStateProps } from "./EmptyState.tsx";
import "./TableCard.css";

export type TableCardColumn<Row> = {
  id: string;
  header: ReactNode;
  type?: "number" | "datetime";
  /** Render this column's value for one row. The table owns its cell element and semantics. */
  cell: (row: Row) => ReactNode;
};

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
  /** Filter the complete collection with searchItems; pass the unfiltered itemCount. */
  search?: DataTableSearch;
  /** Valid result with no rows; the header remains visible. */
  empty?: Pick<EmptyStateProps, "title" | "description">;
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
  empty,
  ...props
}: TableCardProps<Row>) {
  const table = (
    <DataTable searchable={search}>
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
        {empty ? (
          <DataTableEmptyRow colSpan={columns.length} {...empty} />
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column, index) =>
                index === 0 ? (
                  <th key={column.id} scope="row" data-type={column.type}>
                    {column.cell(row)}
                  </th>
                ) : (
                  <td key={column.id} data-type={column.type}>
                    {column.cell(row)}
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
