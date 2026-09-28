import { defineOperation } from "@altertable/data-app-runtime/contract";

function noInput(value: unknown) {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 0) {
    throw new Error("This operation takes no inputs.");
  }
  return {};
}

/** A successful query, rather than profile configuration, verifies the connection. */
export const operations = {
  connection: defineOperation({
    input: noInput,
    output(value: unknown): true {
      if (value !== true) throw new Error("Invalid connection result.");
      return true;
    },
    policy: { maxQueryRows: 1, maxDurationMs: 15_000, exposeSql: true },
    async run({ lakehouse, signal }) {
      await lakehouse.queryAll("SELECT 1 AS connection_check", {
        limit: 1,
        signal,
        name: "connection-check",
      });
      return true;
    },
  }),
};
