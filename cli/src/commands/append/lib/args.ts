import { defineArgs } from "@/lib/command.ts";
import { lakehouseTableArgs } from "@/lib/lakehouse/args.ts";

export const appendRunArgs = defineArgs({
  ...lakehouseTableArgs,
  data: { type: "string", description: "JSON object, array, or @file", required: true },
  sync: {
    type: "boolean",
    description: "Wait for the append operation to finish before returning",
  },
});

export const appendGroupArgs = defineArgs({
  ...appendRunArgs,
  catalog: { ...appendRunArgs.catalog, required: false },
  schema: { ...appendRunArgs.schema, required: false },
  table: { ...appendRunArgs.table, required: false },
  data: { ...appendRunArgs.data, required: false },
});
