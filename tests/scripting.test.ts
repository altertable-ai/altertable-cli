import { beforeAll, describe, expect, test } from "bun:test";
import { VERSION } from "../cli/src/version.ts";
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

  test("ignores unrelated Altertable workflow variables", async () => {
    const result = await workspace.runCommand("altertable --json profile show", {
      env: {
        ALTERTABLE_CATALOG: "analytics",
        ALTERTABLE_SCHEMA: "reporting",
        ALTERTABLE_TABLE: "events",
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).profile.name).toBe("_from_env");
  });

  test.each(["--help", "--version"])("%s bypasses environment validation", async (flag) => {
    const result = await workspace.runCommand(`altertable ${flag}`, {
      env: { ALTERTABLE_UPDATE_SOURCE: "gitlab" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  test.each([
    ["auth", statusMocks.auth, "altertable api /whoami --json", 2, "auth_failed"],
    ["not found", statusMocks.missing, "altertable api /environments/production/connections/missing --json", 4, undefined],
    ["forbidden", statusMocks.forbidden, "altertable api /whoami --json", 3, "forbidden"],
    ["conflict", statusMocks.conflict, "altertable api /service_accounts -f label=dup --json", 5, "conflict"],
    ["rate limit", statusMocks.rate, "altertable api /whoami --json", 7, "rate_limited"],
    ["validation", statusMocks.validation, "altertable api /service_accounts -f label=bad --json", 6, "validation_error"],
    ["server error", statusMocks.server, "altertable api /whoami --json", 8, "server_error"],
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
      const result = await isolated.runCommand("altertable api /whoami --json");
      expect(result.exitCode).toBe(10);
      expect(JSON.parse(result.stderr)).toMatchObject({ error: true, exit_code: 10, code: "configuration_error" });
    } finally {
      await isolated.cleanup();
    }
  });

  test("network errors exit 9 with network_error", async () => {
    const result = await workspace.runCommand("altertable api /whoami --json", {
      env: { ALTERTABLE_MANAGEMENT_API_BASE: "http://127.0.0.1:1", ALTERTABLE_MOCK_HTTP_FILE: undefined },
    });

    expect(result.exitCode).toBe(9);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: true, exit_code: 9, code: "network_error" });
  });

  test("profile show missing uses configuration error semantics", async () => {
    const result = await workspace.runCommand("altertable profile show missing-profile --json");

    expect(result.exitCode).toBe(10);
    expect(JSON.parse(result.stderr)).toMatchObject({ error: true, exit_code: 10, code: "configuration_error" });
  });

  test("usage errors exit 1", async () => {
    const result = await workspace.runCommand("altertable --json query");

    expect(result.exitCode).toBe(1);
  });

  test("invalid trailing timeouts use the JSON error envelope", async () => {
    const result = await workspace.runCommand(
      'altertable query "SELECT 1" --connect-timeout nope --json',
    );
    const error = JSON.parse(result.stderr);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(error).toMatchObject({ error: true, exit_code: 1 });
    expect(result.stderr).not.toContain("/Users/");
  });

  test("invalid global profiles render without a stack trace", async () => {
    const isolated = await createTestWorkspace({
      ALTERTABLE_API_KEY: undefined,
      ALTERTABLE_ENV: undefined,
    });
    try {
      const configured = await isolated.runCommand(
        "altertable profile configure default --api-key atm_default --env production",
      );
      expect(configured.exitCode).toBe(0);

      const result = await isolated.runCommand(
        "altertable profile show --profile definitely_missing_profile",
      );

      expect(result.exitCode).toBe(10);
      expect(result.stderr).toContain("Profile not found: definitely_missing_profile");
      expect(result.stderr).not.toContain("cli/src/");
      expect(result.stderr).not.toContain(" at ");
    } finally {
      await isolated.cleanup();
    }
  });

  test.each(["update", "upgrade"])("%s checks an explicit version", async (command) => {
    const result = await workspace.runCommand(`altertable ${command} ${VERSION} --check`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Target version v${VERSION} is already installed.`);
  });

  test("update accepts inherited global flags after its arguments", async () => {
    const json = await workspace.runCommand(`altertable update ${VERSION} --check --json`);
    const plain = await workspace.runCommand(`altertable update ${VERSION} --check --no-color`);

    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout).latest_version).toBe(VERSION);
    expect(plain.exitCode).toBe(0);
    expect(plain.stdout).not.toContain("\u001B[");
  });

  test("removed update flags are rejected", async () => {
    const result = await workspace.runCommand("altertable update --install");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown option --install.");
  });
});
