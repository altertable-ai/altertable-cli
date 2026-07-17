import { defineArgs } from "@/lib/command.ts";
import { lakehouseFileArgs } from "@/lib/lakehouse/args.ts";

export const upsertArgs = defineArgs({
  ...lakehouseFileArgs,
  key: {
    type: "string",
    description: "Column name used to match existing rows",
    required: true,
  },
});
