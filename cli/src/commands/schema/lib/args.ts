import { defineArguments } from "@/lib/command.ts";
import { queryPagerArgs, queryResultFormatArgs } from "@/lib/query-output-args.ts";

export const schemaArgs = defineArguments({
  catalog: { type: "positional", description: "Catalog name", required: true },
  ...queryResultFormatArgs,
  ...queryPagerArgs,
});
