import type { ApiOperationDetails, ApiRouteRow } from "@/features/api/model.ts";
import { buildApiOperationDetailsView, buildApiRoutesView } from "@/features/api/views.ts";
import { renderDocument } from "@/ui/renderers/terminal.ts";
import { formatTerminalSection } from "@/ui/terminal/styles.ts";

const API_DETAILS_LABEL_WIDTH = 12;

type ApiRoutesRenderOptions = {
  terminalWidth?: number;
};

export function formatApiOperationDetails(operation: ApiOperationDetails): string {
  return formatTerminalSection(
    renderDocument(buildApiOperationDetailsView(operation).document, {
      labelWidth: API_DETAILS_LABEL_WIDTH,
    }),
  );
}

export function formatApiRoutes(rows: readonly ApiRouteRow[]): string {
  return renderApiRoutesTableSection(rows);
}

export function renderApiRoutesTable(
  rows: readonly ApiRouteRow[],
  emptyMessage = "No operations found.",
  options: ApiRoutesRenderOptions = {},
): string {
  return renderDocument(
    buildApiRoutesView(rows, {
      emptyMessage,
      terminalWidth: options.terminalWidth,
    }).document,
  ).join("\n");
}

export function renderApiRoutesTableSection(
  rows: readonly ApiRouteRow[],
  emptyMessage = "No operations found.",
): string {
  return formatTerminalSection(renderDocument(buildApiRoutesView(rows, { emptyMessage }).document));
}
