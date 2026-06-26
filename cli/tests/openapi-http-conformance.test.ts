import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { setCliContext } from "@/context.ts";
import { runApiHttp } from "@/lib/api-http.ts";
import { encodeManagementEndpoint } from "@/lib/management-transport.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

const PLACEHOLDER_VALUES: Record<string, string> = {
  environment_id: "production",
  id: "id_1",
  user_id: "user_1",
  service_account_id: "sa_1",
};

function substituteOpenapiPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = PLACEHOLDER_VALUES[name];
    if (!value) {
      throw new Error(`Missing placeholder mapping for {${name}} in ${path}`);
    }
    return value;
  });
}

let testHome = "";
let mockFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-openapi-http-test-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
  process.env.ALTERTABLE_API_KEY = "atm_test";
  setCliContext({ debug: false, json: true });
  refreshCliRuntimeContext(getCliRuntime().context);
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_API_KEY;
});

describe("openapi HTTP conformance", () => {
  test("covers all generated operations", () => {
    expect(OPENAPI_OPERATIONS.length).toBe(21);
  });

  test("every operation is reachable via runApiHttp", async () => {
    const mocks = OPENAPI_OPERATIONS.map((operation) => {
      const endpoint = substituteOpenapiPath(operation.path);
      const encodedPath = encodeManagementEndpoint(endpoint);
      return {
        urlPattern: encodedPath,
        method: operation.method,
        body: operation.method === "DELETE" ? "" : "{}",
      };
    });
    writeFileSync(mockFile, JSON.stringify(mocks), "utf8");

    for (const operation of OPENAPI_OPERATIONS) {
      const endpoint = substituteOpenapiPath(operation.path);
      const bodyFields =
        operation.method === "POST" || operation.method === "PATCH" || operation.method === "PUT"
          ? { fields: ["label=default"] }
          : {};

      await runApiHttp({
        method: operation.method,
        endpoint,
        ...bodyFields,
      });
    }
  });
});
