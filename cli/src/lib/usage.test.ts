import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { getBootstrapCliContext } from "@/context.ts";
import { defineCommand } from "@/lib/command.ts";
import { renderAltertableUsage, resolveSubCommandForUsage } from "@/lib/usage.ts";
import { configureRunSet } from "@/lib/profile-configure-core.ts";
import { createCliRuntime, setCliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";
import { VERSION } from "@/version.ts";
import { span } from "@/ui/document.ts";
import { getVisibleTextWidth, renderDisplayText } from "@/ui/terminal/styles.ts";
import {
  forceTerminalColorForTests,
  restoreTerminalState,
  snapshotTerminalState,
  type TerminalTestState,
} from "@/test-utils/terminal.ts";

describe("renderAltertableUsage", () => {
  test("groups root commands before global flags in a custom help panel", async () => {
    const usage = await renderAltertableUsage(buildMainCommand());

    expect(usage).toContain(
      `Altertable CLI v${VERSION} • Query and manage your data platform from the`,
    );
    expect(usage).toContain("terminal.");
    expect(usage).toContain("Usage\n    altertable <command> [flags]");
    expect(usage).toContain("\n  Commands\n");
    expect(usage).toContain("\n  Commands\n    Platform\n");
    expect(usage).toContain("Platform");
    expect(usage).toContain("Ingest");
    expect(usage).toContain("Query");
    const commandsSection = usage.indexOf("\n  Commands\n");
    const platformSection = usage.indexOf("\n    Platform\n");
    const ingestSection = usage.indexOf("\n    Ingest\n");
    const querySection = usage.indexOf("\n    Query\n");
    const guidanceSection = usage.indexOf("\n    Use altertable <command> --help");
    const flagsSection = usage.indexOf("\n  Global flags\n");
    expect(commandsSection).toBeLessThan(platformSection);
    expect(platformSection).toBeLessThan(ingestSection);
    expect(ingestSection).toBeLessThan(querySection);
    expect(querySection).toBeLessThan(guidanceSection);
    expect(guidanceSection).toBeLessThan(flagsSection);
    expect(usage).toContain("Use altertable <command> --help for more information about a");
    expect(usage).toContain("command.");
    expect(usage).toContain("--help, -h");
    expect(usage).toContain("--version, -v");
  });

  test("wraps descriptions with hanging indentation at the terminal width", async () => {
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 80, configurable: true });
    try {
      const usage = await renderAltertableUsage(buildMainCommand());
      expect(usage).toContain(
        `    catalogs    Manage catalogs (databases and connections) in the current\n${" ".repeat(16)}environment.`,
      );
      expect(usage).toContain(
        `    --agent                              Agent-friendly preset: structured JSON\n${" ".repeat(41)}output, no pager or terminal styling`,
      );
    } finally {
      Object.defineProperty(process.stdout, "columns", {
        value: originalColumns,
        configurable: true,
      });
    }
  });

  test("keeps the complete panel inside a very narrow terminal", async () => {
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 40, configurable: true });
    try {
      const usage = await renderAltertableUsage(buildMainCommand());
      expect(usage.split("\n").every((line) => getVisibleTextWidth(line) <= 40)).toBe(true);
    } finally {
      Object.defineProperty(process.stdout, "columns", {
        value: originalColumns,
        configurable: true,
      });
    }
  });

  test("renders command usage with shared sections and examples", async () => {
    const command = defineCommand({
      meta: {
        name: "demo",
        description: "Demo command.",
        examples: ["altertable demo --flag value"],
      },
    });

    const usage = await renderAltertableUsage(command);
    expect(usage).toContain("Demo command.");
    expect(usage).toContain("Usage\n    demo");
    expect(usage).toContain("Examples");
    expect(usage).toContain("altertable demo --flag value");
  });

  test("renders nested command help", async () => {
    const main = buildMainCommand();
    const [command, parent] = await resolveSubCommandForUsage(main, ["profile"]);
    const usage = await renderAltertableUsage(command, parent);

    expect(usage).toContain("Manage named profiles and stored credentials.");
    expect(usage).toContain(
      "Usage\n    altertable profile [flags] create|list|show|status|use|switch|current|env|direnv|delete",
    );
    expect(usage).toContain("Options");
    expect(usage).toContain("Commands");
    expect(usage).toContain("\n    Use altertable profile <command> --help");
    expect(usage).toContain("a command.");
  });

  test("highlights command guidance like examples", async () => {
    const terminalState = snapshotTerminalState();
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 120, configurable: true });
    forceTerminalColorForTests();
    try {
      const main = buildMainCommand();
      const [command, parent] = await resolveSubCommandForUsage(main, ["profile"]);
      const usage = await renderAltertableUsage(command, parent);

      expect(usage).toContain(
        `    Use ${renderDisplayText([span("altertable profile <command> --help", "accent")])} for more information about a command.`,
      );
      expect(usage).toContain(
        `    ${renderDisplayText([span("altertable profile show", "accent")])}`,
      );
    } finally {
      restoreTerminalState(terminalState);
      Object.defineProperty(process.stdout, "columns", {
        value: originalColumns,
        configurable: true,
      });
    }
  });

  test("hides advanced subcommands from summary usage", async () => {
    const command = defineCommand({
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
    testHome = mkdtempSync(join(tmpdir(), "altertable-usage-test-"));
  });

  afterEach(() => {
    restoreTerminalState(terminalState);
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
