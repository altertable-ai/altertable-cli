import { createDataContext } from "@altertable/data-app/react";
import { defineQueryNames } from "@altertable/data-app/contract";
import type app from "#app/config.ts";

/** Setup context only. Replace it with the exploration's scope, exact definitions, limitations,
 * and query evidence after inspecting the source data. */
const queryNames = defineQueryNames({
  connection: "connection" satisfies keyof typeof app.queries,
});

export const dataContext = createDataContext(queryNames)({
  description:
    "This starter runs a lightweight query to verify that the selected lakehouse profile can execute SQL. It does not check access to individual datasets. Replace the check with a query that answers a real question before sharing the app.",
  glossary: {
    connectionVerified: {
      term: "Connected",
      definition: "The latest connection-check query completed successfully.",
      queryNames: [queryNames.connection],
    },
  },
});
