import type { AltertableCommandMeta } from "@/lib/command-context.ts";

export type OperationCapability =
  | "local-config"
  | "local-file-read"
  | "management-http"
  | "lakehouse-http"
  | "streaming"
  | "progress"
  | "raw-stdout";

export type OperationCatalogEntry = {
  id: string;
  meta?: AltertableCommandMeta;
  capabilities: readonly OperationCapability[];
};

const operationCatalog = new Map<string, OperationCatalogEntry>();

export function registerOperation(entry: OperationCatalogEntry): void {
  operationCatalog.set(entry.id, entry);
}

export function listOperations(): OperationCatalogEntry[] {
  return [...operationCatalog.values()].sort((left, right) => left.id.localeCompare(right.id));
}
