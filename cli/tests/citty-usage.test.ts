import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { getBootstrapCliContext } from "@/context.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { renderAltertableUsage, resolveSubCommandForUsage } from "@/lib/citty-usage.ts";
import { configureClearAll, configureRunSet } from "@/lib/profile-configure-core.ts";
import { createCliRuntime, runWithCliRuntime, setCliRuntime } from "@/lib/runtime.ts";
import { formatCommandExamplesSection } from "@/ui/terminal/styles.ts";
import {
  restoreTerminalState,
  snapshotTerminalState,
  type TerminalTestState,
} from "@tests/terminal-test-utils.ts";

describe("formatCommandExamplesSection", () => {
  test("returns empty string when there are no examples", () => {
    expect(formatCommandExamplesSection([])).toBe("");
  });

  test("renders an EXAMPLES section with indented lines", () => {
    const section = formatCommandExamplesSection([
      "altertable api /whoami",
      "altertable api routes",
    ]);
    expect(section).toContain("EXAMPLES");
    expect(section).toContain("altertable api /whoami");
    expect(section).toContain("altertable api routes");
  });
});

describe("renderAltertableUsage", () => {
  test("appends command examples to citty usage output", async () => {
    const command = defineAltertableCommand({
      meta: {
        name: "demo",
        description: "Demo command.",
        examples: ["altertable demo --flag value"],
      },
    });

    const usage = await renderAltertableUsage(command);
    expect(usage).toContain("Demo command.");
    expect(usage).not.toContain("(demo)");
    expect(usage).toContain("EXAMPLES");
    expect(usage).toContain("altertable demo --flag value");
  });

  test("hides advanced subcommands from summary usage", async () => {
    const command = defineAltertableCommand({
      meta: { name: "demo", description: "Demo command." },
      subCommands: {
        visible: { meta: { name: "visible", description: "Visible command" } },
        advanced: {
          meta: { name: "advanced", description: "Advanced command", hidden: true },
        },
      },
    });

    const usage = await renderAltertableUsage(command);
    expect(usage).toContain("visible");
    expect(usage).not.toContain("advanced");
  });

  test("resolves api command examples for unknown endpoint errors", async () => {
    const main = buildMainCommand();
    const [command] = await resolveSubCommandForUsage(main, ["api", "/environments/production"]);
    const usage = await renderAltertableUsage(command, main);

    expect(usage).toContain("altertable api /whoami");
    expect(usage).toContain("altertable api GET /environments/production/connections");
  });
});

describe("renderAltertableUsage active context", () => {
  let testHome = "";
  let terminalState: TerminalTestState;

  beforeEach(() => {
    terminalState = snapshotTerminalState();
    testHome = mkdtempSync(join(tmpdir(), "altertable-citty-usage-test-"));
  });

  afterEach(() => {
    restoreTerminalState(terminalState);
    runWithCliRuntime(createCliRuntime(getBootstrapCliContext()), () => {
      process.env.ALTERTABLE_CONFIG_HOME = testHome;
      process.env.ALTERTABLE_SECRET_BACKEND = "file";
      configureClearAll();
    });
    rmSync(testHome, { recursive: true, force: true });
    delete process.env.ALTERTABLE_CONFIG_HOME;
    delete process.env.ALTERTABLE_SECRET_BACKEND;
  });

  test("omits active context on subcommand help", async () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    process.env.ALTERTABLE_CONFIG_HOME = testHome;
    process.env.ALTERTABLE_SECRET_BACKEND = "file";

    const runtime = createCliRuntime(getBootstrapCliContext());
    await runWithCliRuntime(runtime, async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      setCliRuntime(runtime);
      const main = buildMainCommand();
      const [command] = await resolveSubCommandForUsage(main, ["query"]);
      const usage = await renderAltertableUsage(command, main);
      expect(usage).not.toContain("ENV");
    });
  });
});
