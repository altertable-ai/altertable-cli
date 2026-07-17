import { defineArgs } from "@/lib/command.ts";
import {
  queryDisplayArgs,
  queryPagerArgs,
  queryResultFormatArgs,
} from "@/lib/query-output-args.ts";

export const queryRunArgs = defineArgs({
  statement: { type: "positional", description: "SQL statement to run", required: false },
  ...queryResultFormatArgs,
  ...queryDisplayArgs,
  "query-id": { type: "string", description: "Optional stable query id" },
  "session-id": { type: "string", description: "Optional session id" },
  ...queryPagerArgs,
});
