import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCliSession } from "@/lib/cli-session.ts";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { setCliContext } from "@/context.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-cli-session-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
});

describe("createCliSession", () => {
  test("pins the resolved working profile", async () => {
    await configureRunSet({
      apiKey: "atm_test",
      env: "staging",
      dataPlaneUrl: "http://localhost:15000",
      controlPlaneUrl: "http://localhost:13000",
    });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const session = runWithCliRuntime(runtime, () => createCliSession(runtime.context));

    expect(session.profile).toBe("default");
  });
});
