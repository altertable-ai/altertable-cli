import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import { setCliContext, getCliContext } from "@/context.ts";
import { createCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";

let testHome = "";
let mockFile = "";

const WHOAMI_BODY =
  '{"principal":{"type":"User","name":"Jane","email":"j@x.io"},"organization":{"name":"Acme","slug":"acme"}}';

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-profile-status-test-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  // No ALTERTABLE_API_BASE / ALTERTABLE_MANAGEMENT_API_BASE: those trigger
  // env-config isolation (`_from_env`), which would ignore the stored profile
  // this test configures. The mock intercepts by URL substring regardless of host.
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliContext());
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
});

describe("configureVerify", () => {
  test("verifies management and lakehouse credentials via mock HTTP", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        { urlPattern: "/whoami", method: "GET", body: WHOAMI_BODY },
        { urlPattern: "/query", method: "POST", body: "{}" },
      ]),
    );

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      await configureRunSet({ apiKey: "atm_test", env: "prod" });
      await configureRunSet({ user: "alice", password: "secret" });
      refreshCliRuntimeContext(runtime.context);

      const result = await configureVerify(
        ["management", "lakehouse"],
        createExecutionContext(runtime),
      );
      expect(result.verified.management).toBe(true);
      expect(result.verified.lakehouse).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  test("records verification errors without clearing stored credentials", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        { urlPattern: "/whoami", method: "GET", status: 401, body: '{"error":"unauthorized"}' },
      ]),
    );

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    await runWithCliRuntime(runtime, async () => {
      await configureRunSet({ apiKey: "atm_bad", env: "prod" });
      refreshCliRuntimeContext(runtime.context);

      const result = await configureVerify(["management"], createExecutionContext(runtime));
      expect(result.verified.management).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.plane).toBe("management");
    });
  });
});
