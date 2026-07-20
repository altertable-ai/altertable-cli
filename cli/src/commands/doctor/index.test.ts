import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";
import { configFile, credentialsFile, kvSet } from "@/lib/config.ts";

let testHome = "";
let mockFile = "";

const VALID_WHOAMI = {
  principal: {
    id: "user-1",
    type: "User",
    name: "Jane",
    email: "jane@example.com",
  },
  organization: {
    id: "org-1",
    name: "Acme",
    slug: "acme",
  },
  authentication_scope: "user",
};

const VALID_LAKEHOUSE_PROBE = ['{"statement":"SELECT 1"}', '["result"]', "[1]"].join("\n");

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
          body: JSON.stringify(VALID_WHOAMI),
        },
        { urlPattern: "/query", method: "POST", body: VALID_LAKEHOUSE_PROBE },
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

  test("attributes credential backend failures to the secret store", async () => {
    writeFileSync(credentialsFile(), "profile/default/api-key=atm_test\n", { mode: 0o644 });
    chmodSync(credentialsFile(), 0o644);

    const harness = await runCommandWithTestRuntime(["doctor", "--offline"]);
    const report = JSON.parse(harness.stdout[0] ?? "");

    expect(report).toMatchObject({
      healthy: false,
      summary: { passed: 2, failed: 1, skipped: 4 },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile.configuration", status: "pass" }),
        expect.objectContaining({
          id: "credentials.store",
          status: "fail",
          message: expect.stringContaining("permissions 644 are too open"),
        }),
        expect.objectContaining({
          id: "management.credentials",
          status: "skipped",
          message: "Blocked by secret store.",
        }),
      ]),
    );
  });

  test("reports a stale active profile instead of selecting the default", async () => {
    kvSet(configFile(), "active_profile", "missing");

    const harness = await runCommandWithTestRuntime(["doctor", "--offline"]);
    const report = JSON.parse(harness.stdout[0] ?? "");

    expect(report).toMatchObject({
      healthy: false,
      profile: "missing",
      summary: { passed: 1, failed: 1, skipped: 5 },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "profile.configuration",
          status: "fail",
          message: "Profile not found: missing",
        }),
        expect.objectContaining({
          id: "credentials.store",
          status: "skipped",
          message: "Blocked by profile.",
        }),
      ]),
    );
  });

  test("rejects malformed successful API responses", async () => {
    const runtime = createCliRuntime({ debug: false, json: true, agent: false });
    await runWithCliRuntime(runtime, async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      await configureRunSet({ user: "alice", password: "secret" });
    });
    writeFileSync(
      mockFile,
      JSON.stringify([
        { urlPattern: "/whoami", method: "GET", body: "{}" },
        { urlPattern: "/query", method: "POST", body: "{}" },
      ]),
    );

    const harness = await runCommandWithTestRuntime(["doctor"]);
    const report = JSON.parse(harness.stdout[0] ?? "");

    expect(report).toMatchObject({
      healthy: false,
      summary: { passed: 5, failed: 2, skipped: 0 },
    });
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "management.api",
          status: "fail",
          code: "parse_error",
          details: "Expected principal and organization objects.",
        }),
        expect.objectContaining({
          id: "lakehouse.api",
          status: "fail",
          code: "parse_error",
          details: "Expected SELECT 1 to return the numeric value 1.",
        }),
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
