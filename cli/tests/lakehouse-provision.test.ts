import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { configGet, configSet } from "@/lib/config.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { sendOperationHttp } from "@/lib/operation-transport.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { secretGet, secretSet } from "@/lib/secrets.ts";
import { USER_AGENT } from "@/version.ts";

let testHome = "";
let mockFile = "";
let logFile = "";

const WHOAMI_BODY = JSON.stringify({ principal: { id: "user-1", type: "User", name: "Leo" } });
const CREDENTIAL_BODY = JSON.stringify({
  credential: { username: "cli-user", expires_at: "2100-01-01T00:00:00Z" },
  password: "cli-pass",
});

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-lakehouse-provision-test-"));
  mockFile = join(testHome, "mocks.json");
  logFile = join(testHome, "http.log");
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  process.env.ALTERTABLE_API_BASE = "https://api.example.com";
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
  process.env.ALTERTABLE_API_KEY = "atm_test";
  process.env.ALTERTABLE_ENV = "env-1";
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_HTTP_LOG;
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
});

function writeMocks(credentialBody: string = CREDENTIAL_BODY): void {
  writeFileSync(
    mockFile,
    JSON.stringify([
      { urlPattern: "/whoami", method: "GET", body: WHOAMI_BODY },
      {
        urlPattern: "/users/user-1/environments/env-1/credentials",
        method: "POST",
        body: credentialBody,
      },
      { urlPattern: "api.example.com/tables", method: "GET", body: "ok" },
    ]),
  );
}

async function sendLakehouseRequest(): Promise<string> {
  return sendOperationHttp(
    { plane: "lakehouse", method: "GET", endpoint: "/tables" },
    createExecutionContext(getCliRuntime()),
  );
}

describe("lakehouse credential auto-provisioning", () => {
  test("provisions a credential when none exists and management auth is available", async () => {
    writeMocks();

    const response = await sendLakehouseRequest();

    expect(response).toBe("ok");
    const expectedToken = Buffer.from("cli-user:cli-pass").toString("base64");
    expect(secretGet("lakehouse/basic-token")).toBe(expectedToken);
    expect(configGet("lakehouse_credential_expiry")).toBe(
      String(Date.parse("2100-01-01T00:00:00Z")),
    );
    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(
      "URL=https://app.example.com/rest/v1/users/user-1/environments/env-1/credentials",
    );
    expect(logContent).toContain(`"label":"${USER_AGENT}"`);
  });

  test("re-provisions when the stored credential is expired", async () => {
    writeMocks();
    secretSet("lakehouse/basic-token", Buffer.from("old-user:old-pass").toString("base64"));
    configSet("lakehouse_credential_expiry", String(Date.now() - 1000));

    const response = await sendLakehouseRequest();

    expect(response).toBe("ok");
    expect(secretGet("lakehouse/basic-token")).toBe(
      Buffer.from("cli-user:cli-pass").toString("base64"),
    );
  });

  test("aborts on a corrupt stored expiry without provisioning or sending anything", async () => {
    writeMocks();
    secretSet("lakehouse/basic-token", Buffer.from("old-user:old-pass").toString("base64"));
    configSet("lakehouse_credential_expiry", "not-a-number");

    await expect(sendLakehouseRequest()).rejects.toThrow(
      "Stored lakehouse credential expiry is corrupted. Run 'altertable configure --clear' and try again.",
    );
    expect(existsSync(logFile)).toBe(false);
  });

  test("aborts when the created credential has no expiry", () => {
    writeMocks(JSON.stringify({ credential: { username: "cli-user" }, password: "cli-pass" }));

    return expect(sendLakehouseRequest()).rejects.toThrow(
      "Credential creation response was missing an expiry.",
    );
  });

  test("uses valid stored credentials without touching the management plane", async () => {
    writeMocks();
    secretSet("lakehouse/basic-token", Buffer.from("old-user:old-pass").toString("base64"));

    const response = await sendLakehouseRequest();

    expect(response).toBe("ok");
    expect(secretGet("lakehouse/basic-token")).toBe(
      Buffer.from("old-user:old-pass").toString("base64"),
    );
    expect(readFileSync(logFile, "utf8")).not.toContain("/whoami");
  });
});
