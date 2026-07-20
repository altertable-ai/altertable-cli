import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { jsonMock, textMock } from "./mock-http.ts";

describe("altertable doctor", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_BASE: undefined,
      ALTERTABLE_API_KEY: undefined,
      ALTERTABLE_BASIC_AUTH_TOKEN: undefined,
      ALTERTABLE_ENV: undefined,
      ALTERTABLE_LAKEHOUSE_PASSWORD: undefined,
      ALTERTABLE_LAKEHOUSE_USERNAME: undefined,
      ALTERTABLE_MANAGEMENT_API_BASE: undefined,
    });
  });

  beforeEach(async () => {
    await workspace.resetConfig();
    await workspace.resetNetwork();
  });

  test("reports missing credentials as findings instead of a command error", async () => {
    const result = await workspace.runCommand("altertable --json doctor --offline");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      healthy: false,
      profile: "default",
      summary: { passed: 3, warnings: 0, failed: 2, skipped: 2 },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "management.credentials",
          status: "fail",
          code: "configuration_error",
        }),
        expect.objectContaining({
          id: "lakehouse.credentials",
          status: "fail",
          code: "configuration_error",
        }),
      ]),
    );
    expect(await workspace.fileExists(workspace.configFile)).toBe(false);
    expect(await workspace.fileExists(workspace.defaultProfileConfig)).toBe(false);
    expect(await workspace.fileExists(workspace.credentialsFile)).toBe(false);
  });

  test("verifies both API planes with read-only probes", async () => {
    expect(
      (
        await workspace.runCommand(
          "altertable profile configure --api-key atm_test --env production",
        )
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await workspace.runCommand(
          "altertable profile configure --user alice --password secret",
        )
      ).exitCode,
    ).toBe(0);
    await workspace.setupMockHttp([
      jsonMock("GET", "/whoami", {
        principal: {
          id: "user-1",
          type: "User",
          name: "Jane",
          email: "jane@example.com",
        },
        organization: { id: "org-1", name: "Acme", slug: "acme" },
        authentication_scope: "user",
      }),
      textMock(
        "POST",
        "/query",
        ['{"statement":"SELECT 1"}', '["result"]', "[1]"].join("\n"),
      ),
    ]);
    await workspace.setupHttpLog();

    const credentialsBefore = await workspace.readFile(workspace.credentialsFile);
    const result = await workspace.runCommand("altertable --json doctor");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      healthy: true,
      profile: "default",
      summary: { passed: 7, warnings: 0, failed: 0, skipped: 0 },
    });
    expect(await workspace.readFile(workspace.credentialsFile)).toBe(credentialsBefore);
    expect(await workspace.httpLogValues("METHOD")).toEqual(["GET", "POST"]);
    expect(await workspace.httpLogValues("URL")).toEqual(
      expect.arrayContaining([expect.stringContaining("/whoami"), expect.stringContaining("/query")]),
    );
  });

  test("renders an actionable human report", async () => {
    const result = await workspace.runCommand("altertable doctor --offline");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ALTERTABLE CLI DOCTOR");
    expect(result.stdout).toContain("Management auth");
    expect(result.stdout).toContain("altertable profile configure --scope management");
    expect(result.stdout).toContain("Result: unhealthy");
    expect(result.stdout).not.toContain("undefined");
  });
});
