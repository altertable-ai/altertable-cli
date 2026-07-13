import { beforeAll, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestEnv, type TestWorkspace } from "./helpers.ts";
import { jsonMock, textMock, whoamiMock } from "./mock-http.ts";

describe("management API user flows", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({
      ALTERTABLE_API_KEY: undefined,
      ALTERTABLE_ENV: undefined,
      ALTERTABLE_MANAGEMENT_API_BASE: undefined,
    });
  });

  test("uses stored Bearer credentials against the default base URL", async () => {
    await workspace.configureStoredManagementCredential();
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(whoamiMock());

    const result = await workspace.runCommand("altertable api GET /whoami");

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("AUTH")).toBe("Authorization: [REDACTED]");
    expect(await workspace.readHttpLog()).not.toContain("atm_stored");
    expect(await workspace.httpLogValue("URL")).toBe("https://app.altertable.ai/rest/v1/whoami");
  });

  test("environment API key and management root override stored values", async () => {
    await workspace.configureStoredManagementCredential();
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(whoamiMock());

    const result = await workspace.runCommand("altertable api GET /whoami", {
      env: { ALTERTABLE_API_KEY: "atm_env", ALTERTABLE_MANAGEMENT_API_BASE: "http://localhost:9" },
    });

    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogValue("AUTH")).toBe("Authorization: [REDACTED]");
    const log = await workspace.readHttpLog();
    expect(log).not.toContain("atm_env");
    expect(log).not.toContain("atm_stored");
    expect(await workspace.httpLogValue("URL")).toBe("http://localhost:9/rest/v1/whoami");
  });

  test("stored and trailing-slash management roots resolve to /rest/v1", async () => {
    await workspace.configureStoredManagementCredential();
    await workspace.appendFile(workspace.defaultProfileConfig, "management_api_base=http://localhost:7\n");
    await workspace.setupHttpLog();
    await workspace.setupMockHttp(whoamiMock());
    expect((await workspace.runCommand("altertable api GET /whoami", { env: { ALTERTABLE_API_KEY: "atm_env" } })).exitCode).toBe(0);
    expect(await workspace.httpLogValue("URL")).toBe("http://localhost:7/rest/v1/whoami");

    await workspace.setupHttpLog();
    await workspace.setupMockHttp(whoamiMock());
    expect(
      (
        await workspace.runCommand("altertable api GET /whoami", {
          env: { ALTERTABLE_API_KEY: "atm_env", ALTERTABLE_MANAGEMENT_API_BASE: "http://localhost:8/" },
        })
      ).exitCode,
    ).toBe(0);
    expect(await workspace.httpLogValue("URL")).toBe("http://localhost:8/rest/v1/whoami");
  });

  test("renders friendly management HTTP errors without leaking HTML", async () => {
    await workspace.configureStoredManagementCredential();
    await workspace.setupMockHttp([textMock("GET", "/whoami", "<html><body>Internal Server Error</body></html>", 500)]);
    let result = await workspace.runCommand("altertable api GET /whoami");
    expect(result.exitCode).toBe(8);
    expect(result.stderr).toContain("Server error (500)");
    expect(result.stderr).not.toContain("<html>");

    await workspace.setupMockHttp([jsonMock("GET", "/whoami", { error: { message: "invalid api key" } }, 401)]);
    result = await workspace.runCommand("altertable api GET /whoami");
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Authentication failed (401)");
    expect(result.stderr).toContain("invalid api key");

    await workspace.setupMockHttp([jsonMock("GET", "/whoami", { error: { code: "not_found" } }, 404)]);
    result = await workspace.runCommand("altertable api GET /whoami");
    expect(result.exitCode).toBe(4);
    expect(result.stderr).toContain("Not found (404)");
  });

  test("context works locally without credentials, but raw API requires them", async () => {
    const context = await workspace.runCommand("altertable profile show");
    expect(context.exitCode).toBe(0);
    expect(context.stdout).toContain("Profile");
    expect(context.stdout).toContain("Status");
    expect(context.stdout).toContain("empty");

    const api = await workspace.runCommand("altertable api GET /whoami");
    expect(api.exitCode).toBe(10);
    expect(api.stderr).toContain("No management credentials");
  });

  test("api POST supports gh-style fields for service accounts and databases", async () => {
    await workspace.configureStoredManagementCredential();
    const env = { ALTERTABLE_API_KEY: "atm_test", ALTERTABLE_ENV: "production" } satisfies TestEnv;

    await workspace.setupHttpLog();
    await workspace.setupMockHttp([
      jsonMock("POST", "/service_accounts", { service_account: { id: "sa_1", label: "CI Bot", slug: "ci-bot" } }),
    ]);
    let result = await workspace.runCommand('altertable api POST /service_accounts -f "label=CI Bot"', { env });
    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toEqual({ label: "CI Bot" });
    expect(result.stdout).toContain("CI Bot");

    await workspace.setupHttpLog();
    await workspace.setupMockHttp([
      jsonMock("POST", "/environments/production/databases", {
        database: { id: "db_1", name: "Analytics", slug: "analytics", catalog: "analytics" },
      }),
    ]);
    result = await workspace.runCommand("altertable api POST /environments/production/databases -f name=Analytics", { env });
    expect(result.exitCode).toBe(0);
    expect(await workspace.httpLogJsonValue("PAYLOAD")).toEqual({ name: "Analytics" });
    expect(result.stdout).toContain("Analytics");
  });

  test("credential creation human output omits one-time passwords", async () => {
    await workspace.configureStoredManagementCredential();
    await workspace.setupMockHttp([
      jsonMock("POST", "/users/user_1/environments/production/credentials", {
        credential: { id: "cred_1", label: "default", username: "user_123" },
        password: "secret-once",
      }),
    ]);

    const result = await workspace.runCommand("altertable api POST /users/user_1/environments/production/credentials -f label=default");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("default");
    expect(result.stdout).not.toContain("secret-once");
  });
});
