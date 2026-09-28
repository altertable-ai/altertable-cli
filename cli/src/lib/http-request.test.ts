import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { basicAuthToken } from "@/lib/auth.ts";
import { configGet, configSet } from "@/lib/config.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import { sendHttp, type HttpRequest } from "@/lib/http-request.ts";
import { provisionLakehouseCredential } from "@/lib/lakehouse-provision.ts";
import { FROM_ENV_PSEUDOPROFILE_NAME } from "@/lib/profile-store.ts";
import { createCliRuntime, type CliRuntime } from "@/lib/runtime.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-http-request-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
});

function lakehouseQueryRequest(): HttpRequest {
  return { plane: "lakehouse", method: "POST", endpoint: "/query", body: "{}" };
}

function createTestExecution(profile: string): { runtime: CliRuntime; context: ExecutionContext } {
  const runtime = createCliRuntime({ debug: false, json: true, agent: false });
  runtime.output.writeMetadata = () => {};
  return { runtime, context: { cli: runtime.context, output: runtime.output, profile } };
}

describe("lakehouse credential provisioning", () => {
  test("refuses to mint credentials in env configuration mode", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "production";
    const { runtime, context } = createTestExecution(FROM_ENV_PSEUDOPROFILE_NAME);

    expect(
      runWithCliRuntime(runtime, () => sendHttp(lakehouseQueryRequest(), context)),
    ).rejects.toThrow(
      "Lakehouse credentials are not auto-provisioned while environment configuration is active. Set ALTERTABLE_BASIC_AUTH_TOKEN or ALTERTABLE_LAKEHOUSE_USERNAME/PASSWORD.",
    );
  });

  test("read-only diagnostics report missing credentials without provisioning", () => {
    process.env.ALTERTABLE_API_KEY = "atm_env";
    process.env.ALTERTABLE_ENV = "production";
    const { runtime, context } = createTestExecution(FROM_ENV_PSEUDOPROFILE_NAME);

    expect(
      runWithCliRuntime(runtime, () =>
        sendHttp({ ...lakehouseQueryRequest(), authRecovery: false }, context),
      ),
    ).rejects.toThrow("No lakehouse credentials in the environment configuration.");
  });

  test("mints and stores a credential for stored profiles", async () => {
    configSet("api_key_env", "production", "default");
    secretSet("api-key", "atm_stored", "default");
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const mockFile = join(testHome, "mocks.json");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          body: JSON.stringify({ principal: { id: "user-1", type: "User" } }),
        },
        {
          urlPattern: "/users/user-1/environments/production/credentials",
          method: "POST",
          body: JSON.stringify({
            credential: { username: "prov-user", expires_at: expiresAt },
            password: "prov-pass",
          }),
        },
        { urlPattern: "/query", method: "POST", body: '{"ok":true}' },
      ]),
    );
    process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
    const { runtime, context } = createTestExecution("default");

    const body = await runWithCliRuntime(runtime, () => sendHttp(lakehouseQueryRequest(), context));

    expect(body).toBe('{"ok":true}');
    expect(secretGet("lakehouse/basic-token", "default")).toBe(
      basicAuthToken("prov-user", "prov-pass"),
    );
    expect(Number(configGet("lakehouse_credential_expiry", "default"))).toBe(Date.parse(expiresAt));
  });

  test("renews a credential before expiry and retries a revoked credential once", async () => {
    configSet("api_key_env", "production", "default");
    secretSet("api-key", "atm_stored", "default");
    secretSet("lakehouse/basic-token", basicAuthToken("old-user", "old-pass"), "default");
    configSet("lakehouse_credential_expiry", String(Date.now() + 4 * 60_000), "default");
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const mockFile = join(testHome, "renewal-mocks.json");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          body: JSON.stringify({ principal: { id: "user-1", type: "User" } }),
        },
        {
          urlPattern: "/users/user-1/environments/production/credentials",
          method: "POST",
          body: JSON.stringify({
            credential: { username: "new-user", expires_at: expiresAt },
            password: "new-pass",
          }),
        },
        {
          urlPattern: "/query",
          method: "POST",
          authPattern: basicAuthToken("new-user", "new-pass"),
          body: '{"ok":true}',
        },
      ]),
    );
    process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
    const { runtime, context } = createTestExecution("default");
    const result = await runWithCliRuntime(runtime, () =>
      sendHttp(lakehouseQueryRequest(), context),
    );
    expect(result).toBe('{"ok":true}');
    expect(secretGet("lakehouse/basic-token", "default")).toBe(
      basicAuthToken("new-user", "new-pass"),
    );

    secretSet("lakehouse/basic-token", basicAuthToken("revoked-user", "revoked-pass"), "default");
    configSet("lakehouse_credential_expiry", String(Date.now() + 3_600_000), "default");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/query",
          method: "POST",
          authPattern: basicAuthToken("revoked-user", "revoked-pass"),
          status: 401,
          body: "rejected",
        },
        {
          urlPattern: "/query",
          method: "POST",
          authPattern: basicAuthToken("new-user", "new-pass"),
          body: '{"ok":true}',
        },
        {
          urlPattern: "/whoami",
          method: "GET",
          body: JSON.stringify({ principal: { id: "user-1", type: "User" } }),
        },
        {
          urlPattern: "/users/user-1/environments/production/credentials",
          method: "POST",
          body: JSON.stringify({
            credential: { username: "new-user", expires_at: expiresAt },
            password: "new-pass",
          }),
        },
      ]),
    );
    expect(await runWithCliRuntime(runtime, () => sendHttp(lakehouseQueryRequest(), context))).toBe(
      '{"ok":true}',
    );
  });

  test("shares an in-flight credential renewal for the same profile", async () => {
    configSet("api_key_env", "production", "default");
    secretSet("api-key", "atm_stored", "default");
    const mockFile = join(testHome, "concurrent-mocks.json");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          body: JSON.stringify({ principal: { id: "user-1", type: "User" } }),
        },
        {
          urlPattern: "/users/user-1/environments/production/credentials",
          method: "POST",
          body: JSON.stringify({
            credential: {
              username: "new-user",
              expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
            password: "new-pass",
          }),
        },
      ]),
    );
    process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
    const { runtime, context } = createTestExecution("default");
    await runWithCliRuntime(runtime, async () => {
      const first = provisionLakehouseCredential(context);
      const second = provisionLakehouseCredential(context);
      expect(second).toBe(first);
      expect(await first).toContain("Basic");
    });
  });
});
