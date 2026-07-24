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
  process.env.ALTERTABLE_CONFIG_HOME = workspace.home;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";

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
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  workspace.cleanup();
});

function useStoredProfile(): void {
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
  configSet("api_key_env", "production", "default");
  secretSet("api-key", "atm_test", "default");
}

function useLakehouseOnlyProfile(): void {
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
  configSet("user", "alice", "default");
  secretSet("lakehouse/password", "s3cret", "default");
}

function writeAttachAllMocks(): void {
  workspace.writeMocks([
    {
      urlPattern: "/whoami",
      method: "GET",
      body: JSON.stringify({
        principal: { type: "User", name: "Jane", email: "j@x.io" },
        organization: { name: "Acme", slug: "acme" },
      }),
    },
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

function writeLakehouseOnlyMocks(): void {
  workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: '{"ok":true}' }]);
}

function readGeneratedSql(): string {
  return readFileSync(join(workspace.home, "duckdb.sql"), "utf8");
}

describe("duckdb attach-all", () => {
  test("launches DuckDB with verified credentials and every catalog", async () => {
    useStoredProfile();
    secretSet("lakehouse/basic-token", Buffer.from("alice:s3cret").toString("base64"), "default");
    writeAttachAllMocks();

    await runCommandWithTestRuntime(["duckdb"]);

    const sql = readGeneratedSql();
    expect(sql).toContain("INSTALL altertable FROM community;");
    expect(sql).toContain("LOAD altertable;");
    expect(sql).toContain("user=alice password=s3cret catalog=sales");
    expect(sql).toContain('AS "sales" (TYPE ALTERTABLE);');
    expect(sql).toContain('AS "ops-""quoted" (TYPE ALTERTABLE);');
    expect(sql.match(/ATTACH/g)).toHaveLength(2);
  });

  test("launches DuckDB for a username/password profile", async () => {
    useStoredProfile();
    configSet("user", "alice", "default");
    secretSet("lakehouse/password", "s3cret", "default");
    writeAttachAllMocks();

    await runCommandWithTestRuntime(["duckdb"]);

    expect(readGeneratedSql()).toContain("user=alice password=s3cret catalog=sales");
  });

  test("launches DuckDB with environment credentials", async () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "production";
    writeAttachAllMocks();

    await runCommandWithTestRuntime(["duckdb"]);

    expect(readGeneratedSql()).toContain("user=testuser password=testpass catalog=sales");
  });

  test("explains the missing management plane for a lakehouse-only env configuration", async () => {
    delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
    delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-token";
    writeAttachAllMocks();

    expect(runCommandWithTestRuntime(["duckdb"])).rejects.toThrow(
      "Attaching all catalogs requires the management API to list them, but the management plane is not configured. Set ALTERTABLE_API_KEY and ALTERTABLE_ENV, or attach a single catalog directly: altertable duckdb <catalog>.",
    );
  });

  test("explains the missing management credentials even when the environment is set", async () => {
    delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
    delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = "env-token";
    process.env.ALTERTABLE_ENV = "production";
    writeAttachAllMocks();

    expect(runCommandWithTestRuntime(["duckdb"])).rejects.toThrow(
      "Attaching all catalogs requires the management API to list them, but the management plane is not configured. Set ALTERTABLE_API_KEY and ALTERTABLE_ENV, or attach a single catalog directly: altertable duckdb <catalog>.",
    );
  });

  test("explains the missing management plane for a lakehouse-only profile", async () => {
    useLakehouseOnlyProfile();
    writeAttachAllMocks();

    expect(runCommandWithTestRuntime(["duckdb"])).rejects.toThrow(
      "Attaching all catalogs requires the management API to list them, but the management plane is not configured. Run 'altertable login' or 'altertable profile configure --api-key atm_xxx --env <name>', or attach a single catalog directly: altertable duckdb <catalog>.",
    );
  });

  test("does not auto-provision lakehouse credentials in environment configuration mode", async () => {
    delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
    delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "production";
    writeAttachAllMocks();

    expect(runCommandWithTestRuntime(["duckdb"])).rejects.toThrow(
      "Lakehouse credentials are not auto-provisioned while environment configuration is active. Set ALTERTABLE_BASIC_AUTH_TOKEN or ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD.",
    );
  });
});

describe("duckdb attach-single-catalog", () => {
  test("attaches the named catalog for a lakehouse-only profile", async () => {
    useLakehouseOnlyProfile();
    writeLakehouseOnlyMocks();

    await runCommandWithTestRuntime(["duckdb", "sales"]);

    const sql = readGeneratedSql();
    expect(sql).toContain("user=alice password=s3cret catalog=sales");
    expect(sql.match(/ATTACH/g)).toHaveLength(1);
  });

  test("attaches the named catalog with lakehouse-only env configuration", async () => {
    writeLakehouseOnlyMocks();

    await runCommandWithTestRuntime(["duckdb", "sales"]);

    expect(readGeneratedSql()).toContain("user=testuser password=testpass catalog=sales");
  });

  test("does not consult the management catalog list", async () => {
    useLakehouseOnlyProfile();
    writeLakehouseOnlyMocks();

    await runCommandWithTestRuntime(["duckdb", "not-in-any-listing"]);

    expect(readGeneratedSql()).toContain("catalog=not-in-any-listing");
    expect(workspace.readHttpLog()).not.toContain("/environments/");
  });
});
