import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

describe("automatic agent mode", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_AGENT_MODE: undefined,
      AI_AGENT: "1",
    });
  });

  test("detects an agent for structured help and profile output", async () => {
    const help = await workspace.runCommand("altertable --help");
    expect(help.exitCode).toBe(0);
    expect(JSON.parse(help.stdout)).toBeObject();
    const profile = await workspace.runCommand("altertable profile show");
    expect(profile.exitCode).toBe(0);
    expect(JSON.parse(profile.stdout).profile.name).toBe("default");
    expect(profile.stderr).toBe("");
  });

  test("uses JSON for parse errors before a command executes", async () => {
    const result = await workspace.runCommand("altertable unknown-command");
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error).toBeDefined();
  });

  test("keeps explicit query formats instead of forcing JSON", async () => {
    for (const format of ["csv", "markdown"]) {
      const body = format === "csv"
        ? "id\n1\n"
        : ['{"statement":"SELECT 1"}', '["id"]', '[1]'].join("\n");
      await workspace.setupMockHttp([{ method: "POST", urlPattern: "/query", body }]);
      const result = await workspace.runCommand(`altertable query 'SELECT 1' --format=${format}`, {
        env: {
          ALTERTABLE_API_BASE: "https://lakehouse.example.test",
          ALTERTABLE_LAKEHOUSE_USERNAME: "testuser",
          ALTERTABLE_LAKEHOUSE_PASSWORD: "testpass",
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      if (format === "csv") expect(result.stdout).toBe(body);
      else expect(result.stdout).toContain("| id |");
    }
  });

  test("explicit opt-out restores human output and preserves --json", async () => {
    const result = await workspace.runCommand("altertable profile show --no-agent");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Profile");
    const json = await workspace.runCommand("altertable --agent --no-agent --json profile show");
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout).profile.name).toBe("default");
  });

  test("environment overrides and CLI flags take precedence", async () => {
    const disabled = await workspace.runCommand("altertable profile show", {
      env: { ALTERTABLE_AGENT_MODE: "0" },
    });
    expect(disabled.stdout).toContain("Profile");
    const forced = await workspace.runCommand("altertable --agent profile show", {
      env: { ALTERTABLE_AGENT_MODE: "0" },
    });
    expect(JSON.parse(forced.stdout).profile.name).toBe("default");
  });

  test("validates the environment override inside the JSON error boundary", async () => {
    const result = await workspace.runCommand("altertable --json profile show", {
      env: { ALTERTABLE_AGENT_MODE: "invalid" },
    });
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr).error).toBeDefined();
    expect(result.stderr).toContain("ALTERTABLE_AGENT_MODE");
  });
});
