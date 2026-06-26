import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ConfigurePrompts } from "@/lib/configure-prompts.ts";
import {
  configuredPlanesFromOptions,
  formatConfigurePlaneStatusLine,
  hasConfigureCredentialFlags,
  runConfigureWizard,
} from "@/lib/configure-wizard.ts";
import { configureRunSet, withConfigureProfileContext } from "@/lib/configure.ts";
import { configGet } from "@/lib/config.ts";
import { secretGet } from "@/lib/secrets.ts";
import { setCliContext } from "@/context.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";
import { ConfigurationError } from "@/lib/errors.ts";

let testHome = "";

function createMockPrompts(responses: {
  selects?: string[];
  confirms?: boolean[];
  lines?: string[];
  passwords?: string[];
}): ConfigurePrompts {
  let selectIndex = 0;
  let confirmIndex = 0;
  let lineIndex = 0;
  let passwordIndex = 0;

  return {
    writePrompt() {},
    readSelect(_title, _options, defaultValue, _selectOptions) {
      const value = responses.selects?.[selectIndex];
      selectIndex += 1;
      return Promise.resolve(value ?? defaultValue ?? _options[0]?.value ?? "");
    },
    readConfirm(_prompt, defaultYes) {
      const value = responses.confirms?.[confirmIndex];
      confirmIndex += 1;
      return Promise.resolve(value ?? defaultYes ?? true);
    },
    readLine(_prompt) {
      const value = responses.lines?.[lineIndex] ?? "";
      lineIndex += 1;
      return Promise.resolve(value);
    },
    readPassword(_prompt) {
      const value = responses.passwords?.[passwordIndex] ?? "";
      passwordIndex += 1;
      return Promise.resolve(value);
    },
  };
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-configure-wizard-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  setCliContext({ debug: false, json: false, agent: false });
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("configure wizard helpers", () => {
  test("hasConfigureCredentialFlags detects credential flags", () => {
    expect(hasConfigureCredentialFlags({ user: "u" })).toBe(true);
    expect(hasConfigureCredentialFlags({ apiKeyStdin: true })).toBe(true);
    expect(hasConfigureCredentialFlags({})).toBe(false);
  });

  test("configuredPlanesFromOptions maps flags to planes", () => {
    expect(configuredPlanesFromOptions({ apiKey: "k", env: "prod" })).toEqual(["management"]);
    expect(configuredPlanesFromOptions({ user: "u", password: "p" })).toEqual(["lakehouse"]);
  });

  test("formatConfigurePlaneStatusLine keeps short details inline", () => {
    const output = formatConfigurePlaneStatusLine("management", "production", {
      terminalWidth: 80,
    });

    expect(output).toContain("management");
    expect(output).toContain("production");
    expect(output.split("\n")).toHaveLength(1);
  });

  test("formatConfigurePlaneStatusLine stacks long details on narrow terminals", () => {
    const detail = "u_francois_francois_test_7b61c0";
    const output = formatConfigurePlaneStatusLine("lakehouse", detail, { terminalWidth: 40 });

    const lines = output.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("lakehouse");
    expect(lines[0]).not.toContain(detail);
    expect(lines[1]).toContain(detail);
  });

  test("formatConfigurePlaneStatusLine truncates very long stacked details", () => {
    const detail = "u_francois_francois_test_7b61c0_with_extra_suffix";
    const output = formatConfigurePlaneStatusLine("lakehouse", detail, { terminalWidth: 20 });

    expect(output).toContain("…");
    expect(output.split("\n")).toHaveLength(2);
  });
});

describe("runConfigureWizard", () => {
  test("stores management credentials when scope is management", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    const prompts = createMockPrompts({
      lines: ["staging"],
      passwords: ["atm_test_key"],
      confirms: [true, true],
    });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    try {
      await runWithCliRuntime(runtime, async () => {
        await runConfigureWizard({
          scope: "management",
          noVerify: true,
          prompts,
          sink: runtime.output,
        });
      });

      expect(secretGet("api-key")).toBe("atm_test_key");
      expect(configGet("api_key_env")).toBe("staging");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  test("stores lakehouse credentials when scope is lakehouse", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    const prompts = createMockPrompts({
      selects: ["user-password"],
      lines: ["alice"],
      passwords: ["lake-secret"],
      confirms: [true, true],
    });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    try {
      await runWithCliRuntime(runtime, async () => {
        await runConfigureWizard({
          scope: "lakehouse",
          noVerify: true,
          prompts,
          sink: runtime.output,
        });
      });

      expect(configGet("user")).toBe("alice");
      expect(secretGet("lakehouse/password")).toBe("lake-secret");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  test("uses the requested profile for interactive defaults", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    await configureRunSet({ user: "active-user", password: "active-secret" });
    await configureRunSet({
      profile: "target",
      user: "target-user",
      password: "target-secret",
    });

    const prompts = createMockPrompts({
      selects: ["user-password"],
      lines: [""],
      confirms: [true, true],
    });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    try {
      await runWithCliRuntime(runtime, async () => {
        await runConfigureWizard({
          scope: "lakehouse",
          profile: "target",
          noVerify: true,
          prompts,
          sink: runtime.output,
        });
      });

      await withConfigureProfileContext("target", () => {
        expect(configGet("user")).toBe("target-user");
        expect(secretGet("lakehouse/password")).toBe("target-secret");
      });
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  test("does not warn about argv secrets when saving interactively", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    const metadata: string[] = [];
    const prompts = createMockPrompts({
      selects: ["user-password"],
      lines: ["alice"],
      passwords: ["lake-secret"],
      confirms: [true, true],
    });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeMetadata = (lines) => {
      metadata.push(...lines);
    };

    try {
      await runWithCliRuntime(runtime, async () => {
        await runConfigureWizard({
          scope: "lakehouse",
          noVerify: true,
          prompts,
          sink: runtime.output,
        });
      });

      expect(metadata.some((line) => line.includes("--password-stdin"))).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  test("keeps an existing management API key when requested", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    await configureRunSet({ apiKey: "atm_existing", env: "production" });

    const prompts = createMockPrompts({
      lines: ["production"],
      confirms: [true, true],
    });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    try {
      await runWithCliRuntime(runtime, async () => {
        await runConfigureWizard({
          scope: "management",
          noVerify: true,
          prompts,
          sink: runtime.output,
        });
      });

      expect(secretGet("api-key")).toBe("atm_existing");
      expect(configGet("api_key_env")).toBe("production");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  test("rejects non-TTY interactive configure", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    try {
      return expect(
        runWithCliRuntime(runtime, async () => {
          await runConfigureWizard({ sink: runtime.output });
        }),
      ).rejects.toThrow(ConfigurationError);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  test("rejects interactive configure with --json", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    setCliContext({ debug: false, json: true, agent: false });

    const runtime = createCliRuntime({ debug: false, json: true, agent: false });
    try {
      return expect(
        runWithCliRuntime(runtime, async () => {
          await runConfigureWizard({ sink: runtime.output });
        }),
      ).rejects.toThrow(/does not support --json or --agent/);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
      setCliContext({ debug: false, json: false, agent: false });
    }
  });

  test("rejects interactive configure with --agent", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    setCliContext({ debug: false, json: false, agent: true });

    const runtime = createCliRuntime({ debug: false, json: false, agent: true });
    try {
      return expect(
        runWithCliRuntime(runtime, async () => {
          await runConfigureWizard({ sink: runtime.output });
        }),
      ).rejects.toThrow(/does not support --json or --agent/);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
      setCliContext({ debug: false, json: false, agent: false });
    }
  });

  test("configureRunSet without flags throws", () => {
    return expect(configureRunSet({})).rejects.toThrow(/Nothing to configure/);
  });
});
