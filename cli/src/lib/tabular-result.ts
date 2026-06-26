import { renderQueryOutputText, type QueryOutputFormat } from "@/lib/lakehouse-client.ts";

export type TabularResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export function renderTabularOutput(result: TabularResult, format: QueryOutputFormat): string {
  return renderQueryOutputText(
    {
      metadata: {},
      columns: result.columns,
      rows: result.rows,
    },
    format,
  );
}
