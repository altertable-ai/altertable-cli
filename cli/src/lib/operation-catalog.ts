import type { AltertableCommandMeta } from "@/lib/command-context.ts";
import type { AuthPlane } from "@/lib/errors.ts";
import type { OperationEffectKind } from "@/lib/operation-effect.ts";

export type OperationCapability =
  | "local-config"
  | "local-file-read"
  | "local-file-write"
  | "management-http"
  | "lakehouse-http"
  | "streaming"
  | "progress"
  | "raw-stdout";

export type OperationCatalogEntry = {
  id: string;
  meta?: AltertableCommandMeta;
  capabilities: readonly OperationCapability[];
  effects?: readonly OperationEffectKind[];
  planes?: readonly AuthPlane[];
  mutates?: boolean;
  output?: "raw-api" | "normalized" | "human" | "tabular" | "none";
};

export type OperationCatalogMetadata = Omit<OperationCatalogEntry, "id" | "meta" | "capabilities">;

const operationCatalog = new Map<string, OperationCatalogEntry>();

export function registerOperation(entry: OperationCatalogEntry): void {
  operationCatalog.set(entry.id, entry);
}

export function listOperations(): OperationCatalogEntry[] {
  return [...operationCatalog.values()].sort((left, right) => left.id.localeCompare(right.id));
}
