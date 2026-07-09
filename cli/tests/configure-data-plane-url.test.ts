import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBootstrapCliContext } from "@/context.ts";
import { configGet } from "@/lib/config.ts";
import { configureClearAll, configureRunSet } from "@/lib/profile-configure-core.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";
import { secretGet } from "@/lib/secrets.ts";

let testHome = "";

function runInTestHome<T>(run: () => T | Promise<T>): T | Promise<T> {
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  const runtime = createCliRuntime(getBootstrapCliContext());
  return runWithCliRuntime(runtime, run);
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-configure-url-test-"));
});

afterEach(async () => {
  await runInTestHome(async () => {
    configureClearAll();
  });
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("configure --data-plane-url alone", () => {
  test("sets api_base and nothing else", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "staging" });

      await configureRunSet({ dataPlaneUrl: "https://data.example.com" });

      expect(configGet("api_base")).toBe("https://data.example.com");
      expect(secretGet("api-key")).toBe("atm_test");
      expect(configGet("api_key_env")).toBe("staging");
      expect(configGet("management_api_base")).toBe("");
    });
  });

  test("--control-plane-url alone is still rejected", async () => {
    await runInTestHome(() => {
      return expect(
        configureRunSet({ controlPlaneUrl: "https://app.example.com" }),
      ).rejects.toThrow("--control-plane-url must be set together with a credential.");
    });
  });
});
