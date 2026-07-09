import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

const whoamiOk = [{ urlPattern: "/whoami", method: "GET", body: JSON.stringify({ principal: { type: "User", name: "Jane", email: "j@x.io" }, organization: { name: "Acme", slug: "acme" } }) }];
const statusMocks = {
  auth: [{ urlPattern: "/whoami", method: "GET", status: 401, body: JSON.stringify({ error: "invalid key" }) }],
  forbidden: [{ urlPattern: "/whoami", method: "GET", status: 403, body: JSON.stringify({ error: "forbidden" }) }],
  rate: [{ urlPattern: "/whoami", method: "GET", status: 429, body: JSON.stringify({ error: "rate limited" }) }],
  server: [{ urlPattern: "/whoami", method: "GET", status: 500, body: JSON.stringify({ error: "internal server error" }) }],
  missing: [{ urlPattern: "/environments/production/connections/missing", method: "GET", status: 404, body: JSON.stringify({ error: "not found" }) }],
  conflict: [{ urlPattern: "/service_accounts", method: "POST", status: 409, body: JSON.stringify({ error: "conflict" }) }],
  validation: [{ urlPattern: "/service_accounts", method: "POST", status: 422, body: JSON.stringify({ error: "validation failed" }) }],
};

describe("scriptable exit codes and JSON errors", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: "atm_test",
      ALTERTABLE_ENV: "production",
    });
  });

  afterAll(async () => {
    await workspace.cleanup();
  });

  test("--json context exits 0 and prints structured success JSON", async () => {
    await workspace.setupMockHttp(whoamiOk);
    const result = await workspace.runCommand("altertable --json context");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).principal.name).toBe("Jane");
  });

  test.each([
    ["auth", statusMocks.auth, "altertable --json context", 2, "auth_failed"],
    ["not found", statusMocks.missing, "altertable --json api GET /environments/production/connections/missing", 4, undefined],
    ["forbidden", statusMocks.forbidden, "altertable --json context", 3, "forbidden"],
    ["conflict", statusMocks.conflict, "altertable --json api POST /service_accounts -f label=dup", 5, "conflict"],
    ["rate limit", statusMocks.rate, "altertable --json context", 7, "rate_limited"],
    ["validation", statusMocks.validation, "altertable --json api POST /service_accounts -f label=bad", 6, "validation_error"],
    ["server error", statusMocks.server, "altertable --json context", 8, "server_error"],
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
    const result = await workspace.runCommand("altertable --json context", {
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
});
