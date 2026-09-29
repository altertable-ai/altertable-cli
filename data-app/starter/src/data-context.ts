import { createDataContext } from "@altertable/data-app-runtime/ui";
import { connectionQueryNames } from "@altertable/data-app-runtime/contract";

/** Replace this setup context with the question and definitions for your first view. */
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
