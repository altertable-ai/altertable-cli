import { defineArgs } from "@/lib/command.ts";
import { queryRunArgs } from "@/lib/lakehouse/args.ts";

export const schemaArgs = defineArgs({
  catalog: { type: "positional", description: "Catalog name", required: true },
  format: queryRunArgs.format,
  columns: queryRunArgs.columns,
  "max-width": queryRunArgs["max-width"],
  pager: queryRunArgs.pager,
  "read-timeout": queryRunArgs["read-timeout"],
});
