import type { ApiOperationDetails, ApiRouteRow } from "@/commands/api/lib/model.ts";
import { buildApiOperationDetailsView, buildApiRoutesView } from "@/commands/api/lib/views.ts";
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

export function formatApiRoutes(
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
