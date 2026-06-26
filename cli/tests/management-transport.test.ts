import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { managementRequest } from "@/lib/management-transport.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

let testHome = "";
let mockFile = "";
let logFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-mgmt-client-test-"));
  mockFile = join(testHome, "mocks.json");
  logFile = join(testHome, "http.log");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
  process.env.ALTERTABLE_API_KEY = "atm_test";
  setCliContext({ debug: false, json: false });
  refreshCliRuntimeContext(getCliRuntime().context);
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_HTTP_LOG;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_API_KEY;
});

describe("managementRequest", () => {
  test("encodes special characters in path segments", async () => {
    const id = "foo+bar";
    const encodedId = encodeURIComponent(id);
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: `/service_accounts/${encodedId}`,
          method: "GET",
          body: "{}",
        },
      ]),
    );

    await managementRequest("GET", `/service_accounts/${id}`);

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(
      `URL=https://app.example.com/rest/v1/service_accounts/${encodedId}`,
    );
  });
});
