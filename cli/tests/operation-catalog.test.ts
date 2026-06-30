import { describe, expect, test } from "bun:test";
import { buildMainCommand } from "@/cli.ts";
import { listOperations } from "@/lib/operation-catalog.ts";

describe("operation catalog", () => {
  test("records command capabilities as platform data", () => {
    buildMainCommand();

    const operations = listOperations();
    const byId = new Map(operations.map((operation) => [operation.id, operation]));

    expect(byId.get("api.get")?.capabilities).toEqual(["management-http"]);
    expect(byId.get("api.get")?.effects).toEqual(["http"]);
    expect(byId.get("api.get")?.planes).toEqual(["management"]);
    expect(byId.get("api.get")?.output).toBe("tabular");
    expect(byId.get("lakehouse.query.run")?.capabilities).toEqual(["lakehouse-http", "streaming"]);
    expect(byId.get("lakehouse.query.run")?.effects).toEqual(["http", "http-stream"]);
    expect(byId.get("lakehouse.query.run")?.planes).toEqual(["lakehouse"]);
    expect(byId.get("lakehouse.upload")?.capabilities).toEqual([
      "lakehouse-http",
      "local-file-read",
      "progress",
    ]);
    expect(byId.get("lakehouse.upload")?.effects).toEqual(["scope", "http"]);
    expect(byId.get("lakehouse.upload")?.mutates).toBe(true);
    expect(byId.get("completion.install")?.capabilities).toEqual(["local-file-write"]);
    expect(byId.get("configure")?.effects).toEqual(["local"]);
    expect(byId.get("configure")?.mutates).toBe(true);
  });
});
