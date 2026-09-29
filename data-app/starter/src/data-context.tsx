import { createDataContext } from "@altertable/data-app/react";
import { connectionQueryNames } from "@altertable/data-app/contract";

/** Setup context only. Replace it after inspecting the source. For explanatory copy that names
 * tables or columns, register them with defineDataIdentifiers and render <DataIdentifier> in
 * this TSX file; see docs/data.md. */
export const dataContext = createDataContext(connectionQueryNames)({
  description:
    "This starter runs a lightweight query to verify that the selected lakehouse profile can execute SQL. It does not check access to individual datasets. Replace the check with a query that answers a real question before sharing the app.",
  glossary: {
    connectionVerified: {
      term: "Connected",
      definition: "The latest connection-check query completed successfully.",
      queryNames: [connectionQueryNames.connection],
    },
  },
});
