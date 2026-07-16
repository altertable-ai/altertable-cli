import { defineArgs } from "@/lib/command.ts";
import { queryPagerArgs, queryResultFormatArgs } from "@/lib/query-output-args.ts";
import { requestReadTimeoutArgs } from "@/lib/timeout-args.ts";

export const schemaArgs = defineArgs({
  catalog: { type: "positional", description: "Catalog name", required: true },
  ...queryResultFormatArgs,
  ...queryPagerArgs,
  ...requestReadTimeoutArgs,
});
