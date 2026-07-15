import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { jsonMock } from "./mock-http.ts";

const statusMocks = {
  auth: [jsonMock("GET", "/whoami", { error: "invalid key" }, 401)],
  forbidden: [jsonMock("GET", "/whoami", { error: "forbidden" }, 403)],
  rate: [jsonMock("GET", "/whoami", { error: "rate limited" }, 429)],
  server: [jsonMock("GET", "/whoami", { error: "internal server error" }, 500)],
  missing: [jsonMock("GET", "/environments/production/connections/missing", { error: "not found" }, 404)],
  conflict: [jsonMock("POST", "/service_accounts", { error: "conflict" }, 409)],
  validation: [jsonMock("POST", "/service_accounts", { error: "validation failed" }, 422)],
};

describe("scriptable exit codes and JSON errors", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: "atm_test",
      ALTERTABLE_ENV: "production",
    });
  });

  // The workspace is configured through env vars (ALTERTABLE_API_KEY/ENV), so the
  // active identity is the reserved `_from_env` pseudo-profile.
  test("--json profile show exits 0 and prints structured success JSON", async () => {
    const result = await workspace.runCommand("altertable --json profile show");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).profile.name).toBe("_from_env");
  });

  test.each([
    ["auth", statusMocks.auth, "altertable --json api GET /whoami", 2, "auth_failed"],
    ["not found", statusMocks.missing, "altertable --json api GET /environments/production/connections/missing", 4, undefined],
    ["forbidden", statusMocks.forbidden, "altertable --json api GET /whoami", 3, "forbidden"],
    ["conflict", statusMocks.conflict, "altertable --json api POST /service_accounts -f label=dup", 5, "conflict"],
    ["rate limit", statusMocks.rate, "altertable --json api GET /whoami", 7, "rate_limited"],
    ["validation", statusMocks.validation, "altertable --json api POST /service_accounts -f label=bad", 6, "validation_error"],
    ["server error", statusMocks.server, "altertable --json api GET /whoami", 8, "server_error"],
  ])("%s failure emits JSON error envelope", async (_name, mock, command, exitCode, code) => {
    await workspace.setupMockHttp(mock);
    const result = await workspace.runCommand(command);
    const error = JSON.parse(result.stderr);

    expect(result.exitCode).toBe(exitCode);
    expect(result.stdout).toBe("");
    expect(error).toMatchObject({ error: true, exit_code: exitCode });
    if (code !== undefined) {
      expect(error.code).toBe(code);
    }
  });

  test("missing management credentials exits 10 with configuration_error", async () => {
    const isolated = await createTestWorkspace({ ALTERTABLE_API_KEY: undefined, ALTERTABLE_ENV: undefined });
    try {
      const result = await isolated.runCommand("altertable --json api GET /whoami");
      expect(result.exitCode).toBe(10);
      expect(JSON.parse(result.stderr)).toMatchObject({ error: true, exit_code: 10, code: "configuration_error" });
    } finally {
      await isolated.cleanup();
    }
  });

  test("network errors exit 9 with network_error", async () => {
    const result = await workspace.runCommand("altertable --json api GET /whoami", {
      env: { ALTERTABLE_MANAGEMENT_API_BASE: "http://127.0.0.1:1", ALTERTABLE_MOCK_HTTP_FILE: undefined },
    });

    expect(result.exitCode).toBe(9);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: true, exit_code: 9, code: "network_error" });
  });

  test("profile show missing uses configuration error semantics", async () => {
    const result = await workspace.runCommand("altertable --json profile show --name missing-profile");

    expect(result.exitCode).toBe(10);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: true, exit_code: 10, code: "configuration_error" });
  });

  test("usage errors exit 1", async () => {
    const result = await workspace.runCommand("altertable --json query");

    expect(result.exitCode).toBe(1);
  });

  test.each(["update", "upgrade"])("%s checks an explicit version", async (command) => {
    const result = await workspace.runCommand(`altertable ${command} 1.2.0 --check`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Target version v1.2.0 is already installed.");
  });

  test("removed update flags are rejected", async () => {
    const result = await workspace.runCommand("altertable update --install");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown option --install.");
  });
});
