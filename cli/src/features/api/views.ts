import type { ApiOperationDetails, ApiRouteRow } from "@/features/api/model.ts";
import {
  document,
  rows,
  section,
  table,
  type DisplayDocument,
  type DisplayRow,
} from "@/ui/document.ts";
import { terminalAccent } from "@/ui/terminal/styles.ts";

export type ApiOperationDetailsView = {
  document: DisplayDocument;
};

export type ApiRoutesView = {
  document: DisplayDocument;
};

export type ApiRoutesViewOptions = {
  emptyMessage?: string;
  terminalWidth?: number;
};

function apiOperationRows(operation: ApiOperationDetails): DisplayRow[] {
  return [
    { label: "Operation:", value: terminalAccent(operation.operationId) },
    { label: "Method:", value: operation.method },
    { label: "Path:", value: operation.path },
    {
      label: "Parameters:",
      value: operation.parameters.length > 0 ? operation.parameters.join(", ") : "(none)",
    },
    { label: "Summary:", value: operation.summary },
  ];
}

export function buildApiOperationDetailsView(
  operation: ApiOperationDetails,
): ApiOperationDetailsView {
  return {
    document: document(section(rows(apiOperationRows(operation)))),
  };
}

export function buildApiRoutesView(
  routeRows: readonly ApiRouteRow[],
  options: ApiRoutesViewOptions = {},
): ApiRoutesView {
  return {
    document: document(
      section(
        table({
          rows: routeRows,
          columns: [
            {
              header: "METHOD",
              cell: (row) => row.method,
              style: "httpMethod",
            },
            {
              header: "PATH",
              cell: (row) => row.path,
              style: "foreground",
            },
            {
              header: "OPERATION",
              cell: (row) => row.operationId,
              style: "subtle",
            },
            {
              header: "SUMMARY",
              cell: (row) => row.summary,
              style: "muted",
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
    ),
  };
}
