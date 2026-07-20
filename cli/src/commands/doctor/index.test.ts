import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

let testHome = "";
let mockFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-doctor-test-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
});

describe("doctor command", () => {
  test("reports local findings without materializing the default profile", async () => {
    const harness = await runCommandWithTestRuntime(["doctor", "--offline"]);
    const report = JSON.parse(harness.stdout[0] ?? "");

    expect(report).toMatchObject({
      healthy: false,
      profile: "default",
      summary: { passed: 3, failed: 2, skipped: 2 },
    });
    expect(await Bun.file(join(testHome, "config")).exists()).toBe(false);
    expect(await Bun.file(join(testHome, "profiles", "default", "config")).exists()).toBe(false);
  });

  test("runs both read-only API probes for a configured profile", async () => {
    const runtime = createCliRuntime({ debug: false, json: true, agent: false });
    await runWithCliRuntime(runtime, async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      await configureRunSet({ user: "alice", password: "secret" });
    });
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          body: '{"principal":{"type":"User","name":"Jane","email":"jane@example.com"},"organization":{"name":"Acme","slug":"acme"}}',
        },
        { urlPattern: "/query", method: "POST", body: "{}" },
      ]),
    );

    const harness = await runCommandWithTestRuntime(["doctor"]);
    const report = JSON.parse(harness.stdout[0] ?? "");

    expect(report).toMatchObject({
      healthy: true,
      summary: { passed: 7, failed: 0, skipped: 0 },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "management.api",
          status: "pass",
          message: expect.stringContaining("Jane <jane@example.com>"),
        }),
        expect.objectContaining({ id: "lakehouse.api", status: "pass" }),
      ]),
    );
  });

  test("renders remediation in human output", async () => {
    const harness = await runCommandWithTestRuntime(["doctor", "--offline"], {
      debug: false,
      json: false,
      agent: false,
      noColor: true,
    });

    expect(harness.stdout[0]).toContain("ALTERTABLE CLI DOCTOR");
    expect(harness.stdout[0]).toContain("altertable profile configure --scope management");
    expect(harness.stdout[0]).toContain("Result: unhealthy");
  });
});
