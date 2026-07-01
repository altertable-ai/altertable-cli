import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCommand } from "citty";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import {
  checkForUpdate,
  compareVersions,
  detectInstallManager,
  fetchLatestRelease,
  getUpdateCheckInterval,
  readUpdateState,
  setUpdateCheckInterval,
  shouldRunAutomaticUpdateCheck,
} from "@/lib/updater.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-updater-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_NO_UPDATE_CHECK;
  delete process.env.ALTERTABLE_UPDATE_CHECK;
  delete process.env.ALTERTABLE_UPDATE_INSTALLER;
  delete process.env.CI;
  delete process.env.TEST;
});

function jsonFetch(data: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch;
}

describe("version comparison", () => {
  test("orders stable and prerelease versions", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.2.0-beta.1")).toBe(1);
    expect(compareVersions("1.2.0-beta.2", "1.2.0-beta.10")).toBe(-1);
  });
});

describe("release discovery", () => {
  test("reads npm latest metadata", async () => {
    const release = await fetchLatestRelease({
      source: "npm",
      fetchImpl: jsonFetch({ version: "1.2.3" }),
    });

    expect(release).toEqual({
      version: "1.2.3",
      source: "npm",
      releaseUrl: "https://www.npmjs.com/package/@altertable/cli/v/1.2.3",
    });
  });

  test("reads GitHub latest release metadata", async () => {
    const release = await fetchLatestRelease({
      source: "github",
      fetchImpl: jsonFetch({
        tag_name: "v1.2.3",
        html_url: "https://github.com/altertable-ai/altertable-cli/releases/tag/v1.2.3",
      }),
    });

    expect(release.version).toBe("1.2.3");
    expect(release.source).toBe("github");
    expect(release.releaseUrl).toContain("releases/tag/v1.2.3");
  });

  test("checkForUpdate writes cached state", async () => {
    const result = await checkForUpdate({
      source: "npm",
      fetchImpl: jsonFetch({ version: "1.2.3" }),
    });

    expect(result.update_available).toBe(true);
    expect(readUpdateState().latest_version).toBe("1.2.3");
  });
});

describe("automatic update checks", () => {
  test("requires human stderr and skips JSON output", () => {
    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        rawArgs: ["context"],
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(true);

    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: true, agent: false },
        rawArgs: ["context"],
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(false);

    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        rawArgs: ["context"],
        state: {},
        stderrIsTTY: false,
      }),
    ).toBe(false);
  });

  test("honors interval policy and environment opt-out", () => {
    setUpdateCheckInterval("never");
    expect(getUpdateCheckInterval()).toBe("never");
    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        rawArgs: ["context"],
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(false);

    setUpdateCheckInterval("daily");
    process.env.ALTERTABLE_NO_UPDATE_CHECK = "1";
    expect(
      shouldRunAutomaticUpdateCheck({
        context: { debug: false, json: false, agent: false },
        rawArgs: ["context"],
        state: {},
        stderrIsTTY: true,
      }),
    ).toBe(false);
  });

  test("detects package manager from environment", () => {
    expect(detectInstallManager({ npm_config_user_agent: "pnpm/9.0.0 npm/? node/?" })).toBe("pnpm");
    expect(detectInstallManager({ BUN_INSTALL: "/tmp/bun" })).toBe("bun");
    expect(detectInstallManager({ ALTERTABLE_UPDATE_INSTALLER: "yarn" })).toBe("yarn");
  });
});

describe("update command", () => {
  test("reports explicit target version without network", async () => {
    const stdout: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeHuman = (text) => {
      stdout.push(text);
    };

    await runWithCliRuntime(runtime, async () => {
      await runCommand(buildMainCommand(), { rawArgs: ["update", "--target-version", "1.2.3"] });
    });

    expect(stdout[0]).toContain("altertable 1.2.3 is available");
  });

  test("configures automatic check interval", async () => {
    const stdout: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeHuman = (text) => {
      stdout.push(text);
    };

    await runWithCliRuntime(runtime, async () => {
      await runCommand(buildMainCommand(), {
        rawArgs: ["update", "--check-interval", "weekly"],
      });
    });

    expect(stdout[0]).toContain("Auto update checks: weekly");
    expect(getUpdateCheckInterval()).toBe("weekly");
  });
});
