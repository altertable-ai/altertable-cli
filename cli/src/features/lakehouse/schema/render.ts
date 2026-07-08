import { buildSchemaTreeView } from "@/features/lakehouse/schema/views.ts";
import type { LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import { renderTree } from "@/ui/layouts/tree.ts";

export function formatSchemaTree(result: LakehouseQueryResult, catalog: string): string {
  return renderTree(buildSchemaTreeView(result, catalog)).join("\n");
}
