import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { catalogsMock, jsonMock } from "./mock-http.ts";

describe("altertable catalogs", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: "atm_test",
      ALTERTABLE_ENV: "production",
      ALTERTABLE_MANAGEMENT_API_BASE: undefined,
    });
  });

  test("create posts to databases with the expected payload and confirmation", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(catalogsMock());

    const result = await workspace.runCommand('altertable catalogs create "My Cat"');

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("METHOD")).toBe("POST");
    expect(await workspace.httpLogValue("URL")).toBe("https://app.altertable.ai/rest/v1/environments/production/databases");
    expect(await workspace.httpLogValue("AUTH")).toBe("Authorization: [REDACTED]");
    expect(await workspace.readHttpLog()).not.toContain("atm_test");
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toEqual({ engine: "altertable", name: "My Cat" });
    expect(result.stdout).toContain('Created catalog "My Cat"');
  });

  test("create requires an environment", async () => {
    const result = await workspace.runCommand("altertable catalogs create X", {
      env: { ALTERTABLE_ENV: "" },
    });
    expect(result.exitCode).toBe(10);
    expect(result.stderr).toContain("No environment set");
  });

  test("create rejects flag-shaped and extra input before sending a request", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(catalogsMock());

    const result = await workspace.runCommand(
      "altertable catalogs create --engine altertable --name Analytics",
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown option --engine");
    expect(await workspace.readHttpLog()).not.toContain("METHOD=");
  });

  test("list calls databases then connections and renders databases first", async () => {
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(catalogsMock());

    const result = await workspace.runCommand("altertable catalogs");
    const urls = await workspace.httpLogValues("URL");

    expect(result.exitCode).toBe(0);
    expect(urls.findIndex((url) => url.endsWith("/databases"))).toBeLessThan(urls.findIndex((url) => url.endsWith("/connections")));
    expect(result.stdout).toMatch(/SLUG\s+NAME\s+ENGINE\s+CATALOG\s+TYPE/);
    expect(result.stdout.indexOf("my-cat")).toBeLessThan(result.stdout.indexOf("prod-pg"));
  });

  test("--agent returns a structured catalogs envelope", async () => {
    await workspace.setupMockHttp(catalogsMock());
    const result = await workspace.runCommand("altertable catalogs --agent");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).catalogs).toHaveLength(2);
  });

  test("databases always render as altertable engine while connections preserve theirs", async () => {
    await workspace.setupMockHttp(catalogsMock({ databaseEngine: "postgres", includeCreate: false }));

    const result = await workspace.runCommand("altertable catalogs");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^my-cat\s+.*altertable/m);
    expect(result.stdout).toMatch(/^prod-pg\s+.*postgres/m);
  });

  test("list hard-fails when a management request fails", async () => {
    await workspace.setupMockHttp([
      jsonMock("GET", "/environments/production/databases", { error: { code: "not_found" } }, 404),
    ]);

    const result = await workspace.runCommand("altertable catalogs");

    expect(result.exitCode).toBe(4);
  });
});
