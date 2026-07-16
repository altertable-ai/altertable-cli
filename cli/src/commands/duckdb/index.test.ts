import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configSet } from "@/lib/config.ts";
import { secretSet } from "@/lib/secrets.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

let workspace: LakehouseTestWorkspace;
let originalPath: string | undefined;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("duckdb-command");
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
  process.env.ALTERTABLE_CONFIG_HOME = workspace.home;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  configSet("api_key_env", "production", "default");
  secretSet("api-key", "atm_test", "default");
  secretSet("lakehouse/basic-token", Buffer.from("alice:s3cret").toString("base64"), "default");

  const executable = workspace.writeFile(
    "duckdb",
    `#!/bin/sh\nprintf '%s' "$2" > "${join(workspace.home, "duckdb.sql")}"\n`,
  );
  chmodSync(executable, 0o755);
  originalPath = process.env.PATH;
  process.env.PATH = `${workspace.home}:${originalPath ?? ""}`;
});

afterEach(() => {
  process.env.PATH = originalPath;
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  workspace.cleanup();
});

function writeDuckdbMocks(): void {
  workspace.writeMocks([
    { urlPattern: "/query", method: "POST", body: '{"ok":true}' },
    {
      urlPattern: "/environments/production/databases",
      method: "GET",
      body: JSON.stringify({
        databases: [
          { name: "Sales", slug: "sales", catalog: "sales" },
          { name: "Ops", slug: "ops", catalog: 'ops-"quoted' },
        ],
      }),
    },
    {
      urlPattern: "/environments/production/connections",
      method: "GET",
      body: '{"connections":[]}',
    },
  ]);
}

describe("duckdb command", () => {
  test("launches DuckDB with verified credentials and every catalog", async () => {
    writeDuckdbMocks();

    await runCommandWithTestRuntime(["duckdb"]);

    const sql = readFileSync(join(workspace.home, "duckdb.sql"), "utf8");
    expect(sql).toContain("INSTALL altertable FROM community;");
    expect(sql).toContain("LOAD altertable;");
    expect(sql).toContain("user=alice password=s3cret catalog=sales");
    expect(sql).toContain('AS "sales" (TYPE ALTERTABLE);');
    expect(sql).toContain('AS "ops-""quoted" (TYPE ALTERTABLE);');
    expect(sql.match(/ATTACH/g)).toHaveLength(2);
  });

  test("rejects a requested catalog that is not available", () => {
    writeDuckdbMocks();

    return expect(runCommandWithTestRuntime(["duckdb", "missing"])).rejects.toThrow(
      'Catalog "missing" not found',
    );
  });
});
