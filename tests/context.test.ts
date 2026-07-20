import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

describe("altertable profile show", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: undefined,
      ALTERTABLE_ENV: undefined,
      ALTERTABLE_MANAGEMENT_API_BASE: undefined,
    });
  });

  beforeEach(async () => {
    await workspace.resetConfig();
    expect(
      (await workspace.runCommand("altertable profile configure --api-key atm_test --env production")).exitCode,
    ).toBe(0);
  });

  test("shows the stored profile's auth and environment", async () => {
    const result = await workspace.runCommand("altertable profile show");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Profile");
    expect(result.stdout).toContain("default");
    expect(result.stdout).toContain("Management auth");
    expect(result.stdout).toContain("api_key");
    expect(result.stdout).toContain("Environment");
    expect(result.stdout).toContain("production");
    expect(result.stdout).not.toContain("atm_test");
  });

  test("--no-color emits plain text without ANSI styling", async () => {
    const result = await workspace.runCommand("altertable --no-color profile show");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/\x1B/);
    expect(result.stdout).toContain("production");
  });

  test("--agent returns structured profile JSON", async () => {
    const result = await workspace.runCommand("altertable --agent profile show");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      profile: {
        name: "default",
        environment: "production",
        auth: { management: "api_key" },
      },
    });
  });
});
