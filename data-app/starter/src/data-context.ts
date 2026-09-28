import { defineDataContext } from "@altertable/data-app-runtime/ui";

/** Replace this setup context with the question and definitions for your first view. */
export const dataContext = defineDataContext({
  description:
    "This starter runs a lightweight query to verify that the selected lakehouse profile can execute SQL. It does not check access to individual datasets. Replace the check with a query that answers a real question before sharing the app.",
  glossary: {
    connectionVerified: {
      term: "Connected",
      definition: "The latest connection-check query completed successfully.",
      queryNames: ["connection-check"],
    },
  },
});
