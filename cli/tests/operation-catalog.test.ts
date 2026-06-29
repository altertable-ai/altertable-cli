import { describe, expect, test } from "bun:test";
import { buildMainCommand } from "@/cli.ts";
import { listOperations } from "@/lib/operation-catalog.ts";

describe("operation catalog", () => {
  test("records command capabilities as platform data", () => {
    buildMainCommand();

    const operations = listOperations();
    const byId = new Map(operations.map((operation) => [operation.id, operation]));

    expect(byId.get("api.get")?.capabilities).toEqual(["management-http"]);
    expect(byId.get("lakehouse.query.run")?.capabilities).toEqual(["lakehouse-http", "streaming"]);
    expect(byId.get("lakehouse.upload")?.capabilities).toEqual([
      "lakehouse-http",
      "local-file-read",
      "progress",
    ]);
  });
});
