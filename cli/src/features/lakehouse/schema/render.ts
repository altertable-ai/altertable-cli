import { buildSchemaTreeView } from "@/features/lakehouse/schema/views.ts";
import type { LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import { renderTreeText } from "@/ui/layouts/tree.ts";

export function formatSchemaTree(result: LakehouseQueryResult, catalog: string): string {
  return renderTreeText(buildSchemaTreeView(result, catalog));
}
