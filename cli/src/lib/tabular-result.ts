import {
  renderManagementTabularOutput,
  type ManagementOutputFormat,
} from "@/lib/lakehouse-client.ts";

export type TabularResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export function renderTabularOutput(result: TabularResult, format: ManagementOutputFormat): string {
  return renderManagementTabularOutput(
    {
      metadata: {},
      columns: result.columns,
      rows: result.rows,
    },
    format,
  );
}
