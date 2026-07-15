import type { ApiOperationDetails, ApiRouteRow } from "@/features/api/model.ts";
import { buildApiOperationDetailsView, buildApiRoutesView } from "@/features/api/views.ts";
import { renderDocument, renderDocumentText } from "@/ui/renderers/terminal.ts";

const API_DETAILS_LABEL_WIDTH = 12;

type ApiRoutesRenderOptions = {
  terminalWidth?: number;
};

export function formatApiOperationDetails(operation: ApiOperationDetails): string {
  return renderDocument(buildApiOperationDetailsView(operation), {
    labelWidth: API_DETAILS_LABEL_WIDTH,
  }).join("\n");
}

export function formatApiRoutes(rows: readonly ApiRouteRow[]): string {
  return renderApiRoutesTableSection(rows);
}

export function renderApiRoutesTable(
  rows: readonly ApiRouteRow[],
  emptyMessage = "No operations found.",
  options: ApiRoutesRenderOptions = {},
): string {
  return renderDocumentText(
    buildApiRoutesView(rows, {
      emptyMessage,
      terminalWidth: options.terminalWidth,
    }),
  );
}

export function renderApiRoutesTableSection(
  rows: readonly ApiRouteRow[],
  emptyMessage = "No operations found.",
): string {
  return renderDocumentText(buildApiRoutesView(rows, { emptyMessage }));
}
