import { connectionCheck } from "@altertable/data-app-runtime/contract";

/** A successful SQL query, rather than profile configuration, verifies the connection. */
export const operations = { connection: connectionCheck() };
