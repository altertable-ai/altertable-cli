import { defineArguments } from "@/lib/command.ts";
import { lakehouseFileArgs } from "@/lib/lakehouse/args.ts";

export const upsertArgs = defineArguments({
  ...lakehouseFileArgs,
  key: {
    type: "string",
    description: "Column name used to match existing rows",
    required: true,
  },
});
