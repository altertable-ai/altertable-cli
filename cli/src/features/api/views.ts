import type { ApiOperationDetails, ApiRouteRow } from "@/features/api/model.ts";
import {
  document,
  rows,
  section,
  span,
  table,
  type DisplayDocument,
  type DisplayRow,
} from "@/ui/document.ts";

export type ApiRoutesViewOptions = {
  emptyMessage?: string;
  terminalWidth?: number;
};

function apiOperationRows(operation: ApiOperationDetails): DisplayRow[] {
  return [
    { label: "Operation:", value: [span(operation.operationId, "accent")] },
    { label: "Method:", value: operation.method },
    { label: "Path:", value: operation.path },
    {
      label: "Parameters:",
      value: operation.parameters.length > 0 ? operation.parameters.join(", ") : "(none)",
    },
    { label: "Summary:", value: operation.summary },
  ];
}

export function buildApiOperationDetailsView(operation: ApiOperationDetails): DisplayDocument {
  return document(section(rows(apiOperationRows(operation))));
}

export function buildApiRoutesView(
  routeRows: readonly ApiRouteRow[],
  options: ApiRoutesViewOptions = {},
): DisplayDocument {
  return document(
    section(
      table({
        rows: routeRows,
        columns: [
          {
            header: "METHOD",
            cell: (row) => [span(row.method, "httpMethod")],
          },
          {
            header: "PATH",
            cell: (row) => row.path,
          },
          {
            header: "OPERATION",
            cell: (row) => [span(row.operationId, "subtle")],
          },
          {
            header: "SUMMARY",
            cell: (row) => [span(row.summary, "muted")],
          },
        ],
        emptyMessage: options.emptyMessage ?? "No operations found.",
        options: {
          terminalWidth: options.terminalWidth,
          horizontalScroll: true,
          groupBy: (row) => row.path.split("/").filter(Boolean)[0] ?? "",
        },
      }),
    ),
  );
}
