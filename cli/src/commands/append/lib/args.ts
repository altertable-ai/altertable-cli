import type { ArgsDef } from "citty";

export const appendRunArgs = {
  catalog: { type: "string", description: "Catalog name", required: true },
  schema: { type: "string", description: "Schema name", required: true },
  table: { type: "string", description: "Table name", required: true },
  data: { type: "string", description: "JSON object, array, or @file", required: true },
  sync: {
    type: "boolean",
    description: "Wait for the append operation to finish before returning",
  },
} satisfies ArgsDef;

export const appendGroupArgs = {
  ...appendRunArgs,
  catalog: { ...appendRunArgs.catalog, required: false },
  schema: { ...appendRunArgs.schema, required: false },
  table: { ...appendRunArgs.table, required: false },
  data: { ...appendRunArgs.data, required: false },
} satisfies ArgsDef;
