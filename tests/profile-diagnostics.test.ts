import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { jsonMock } from "./mock-http.ts";

describe("profile diagnostic reports", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: undefined,
      ALTERTABLE_ENV: undefined,
      ALTERTABLE_LAKEHOUSE_PASSWORD: undefined,
      ALTERTABLE_LAKEHOUSE_USERNAME: undefined,
    });
  });

  beforeEach(async () => {
    await workspace.resetConfig();
    await workspace.resetNetwork();
  });

  test("profile show keeps empty profiles successful and actionable", async () => {
    const human = await workspace.runCommand("altertable profile show");
    const json = await workspace.runCommand("altertable --json profile show");
    const agent = await workspace.runCommand("altertable --agent profile show");

    expect(human.exitCode).toBe(0);
    expect(human.stderr).toBe("");
    expect(human.stdout).toContain("Status");
    expect(human.stdout).toContain("empty");
    expect(human.stdout).toContain("Next steps:");
    expect(human.stdout).toContain("altertable profile configure");
    for (const result of [json, agent]) {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        profile: { status: "empty" },
        next_steps: [
          expect.stringContaining("--api-key-stdin"),
          expect.stringContaining("--password-stdin"),
        ],
      });
    }
  });

  test("profile show guides partially configured profiles", async () => {
    const configured = await workspace.runCommand(
      "altertable profile configure --data-plane-url http://localhost:15000",
    );
    const result = await workspace.runCommand("altertable --json profile show");

    expect(configured.exitCode).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      profile: { status: "partial" },
      next_steps: [
        expect.stringContaining("--api-key-stdin"),
        expect.stringContaining("--password-stdin"),
      ],
    });
  });

  test.each([
    ["human", "altertable profile status"],
    ["json", "altertable --json profile status"],
    ["agent", "altertable --agent profile status"],
  ])(
    "profile status returns an unhealthy %s report when no credentials exist",
    async (mode, command) => {
      const result = await workspace.runCommand(command);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      if (mode === "human") {
        expect(result.stdout).toContain("Verification:");
        expect(result.stdout).toContain("no credentials configured");
      } else {
        expect(JSON.parse(result.stdout)).toMatchObject({
          profile: { status: "empty" },
          verification: { configured: [], errors: [] },
        });
      }
    },
  );

  test.each([
    ["human", "altertable profile status"],
    ["json", "altertable --json profile status"],
    ["agent", "altertable --agent profile status"],
  ])(
    "profile status returns an unhealthy %s report when verification fails",
    async (mode, command) => {
      const configured = await workspace.runCommand(
        "altertable profile configure --api-key atm_bad --env production",
      );
      await workspace.setupMockHttp([jsonMock("GET", "/whoami", { error: "invalid key" }, 401)]);

      const result = await workspace.runCommand(command);

      expect(configured.exitCode).toBe(0);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      if (mode === "human") {
        expect(result.stdout).toContain("Verification:");
        expect(result.stdout).toContain("failed (management)");
      } else {
        expect(JSON.parse(result.stdout)).toMatchObject({
          profile: { auth: { management: "api_key" } },
          verification: {
            configured: ["management"],
            verified: { management: false },
            errors: [{ plane: "management" }],
          },
        });
      }
    },
  );
});
