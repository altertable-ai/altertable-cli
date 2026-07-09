import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { whoamiMock } from "./mock-http.ts";

describe("altertable context", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: "atm_test",
      ALTERTABLE_ENV: undefined,
      ALTERTABLE_MANAGEMENT_API_BASE: undefined,
    });
  });

  afterAll(async () => {
    await workspace.cleanup();
  });

  beforeEach(async () => {
    await workspace.resetNetwork();
  });

  test("formats a User principal", async () => {
    await workspace.setupMockHttp(whoamiMock({ type: "User", name: "Jane Doe", email: "jane@x.io" }));
    const result = await workspace.runCommand("altertable context");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Profile:");
    expect(result.stdout).toContain("User:");
    expect(result.stdout).toContain("Jane Doe <jane@x.io>");
    expect(result.stdout).toContain("Organization:");
    expect(result.stdout).toContain("Acme (acme)");
  });

  test("--no-color emits plain text without ANSI styling", async () => {
    await workspace.setupMockHttp(whoamiMock({ type: "User", name: "Jane Doe", email: "jane@x.io" }));
    const result = await workspace.runCommand("altertable --no-color context");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/\x1B/);
    expect(result.stdout).toContain("Jane Doe <jane@x.io>");
  });

  test("--agent returns structured session JSON", async () => {
    await workspace.setupMockHttp(whoamiMock({ type: "User", name: "Jane Doe", email: "jane@x.io" }));
    const result = await workspace.runCommand("altertable --agent context");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      principal: { name: "Jane Doe" },
      profile: "default",
    });
  });

  test("formats a ServiceAccount principal", async () => {
    await workspace.setupMockHttp(whoamiMock({ type: "ServiceAccount", name: "ci-bot", slug: "ci-bot" }));
    const result = await workspace.runCommand("altertable context");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Service account:");
    expect(result.stdout).toContain("ci-bot (ci-bot)");
  });
});
