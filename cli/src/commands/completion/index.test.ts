import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCommand, type Command } from "@/lib/command.ts";
import { executeCommand } from "@/lib/command-parser.ts";
import { buildMainCommand } from "@/cli.ts";
import { createCompletionCommand } from "@/commands/completion/index.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

const TERMINAL_CONTROL_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m|${String.fromCharCode(27)}\\]8;;[^\\u0007]*\\u0007`,
  "g",
);

const minimalRootCommand = defineCommand({
  metadata: { name: "altertable" },
  args: {
    json: { type: "boolean", description: "Output raw JSON responses" },
    debug: { type: "boolean", alias: "d", description: "Enable debug output" },
  },
  subcommands: {
    query: { metadata: { name: "query" } },
    api: {
      metadata: { name: "api" },
      subcommands: {
        connections: {
          metadata: { name: "connections" },
          subcommands: {
            list: { metadata: { name: "list" } },
          },
        },
      },
    },
    catalogs: {
      metadata: { name: "catalogs" },
      subcommands: {
        list: { metadata: { name: "list" } },
        create: { metadata: { name: "create" } },
      },
    },
    completion: { metadata: { name: "completion" } },
  },
});

let testHome: string | undefined;

function visibleTerminalText(text: string): string {
  return text.replace(TERMINAL_CONTROL_PATTERN, "");
}

function setTestHome(): string {
  testHome = mkdtempSync(join(tmpdir(), "altertable-completion-test-"));
  process.env.HOME = testHome;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_DATA_HOME;
  return testHome;
}

async function captureCompletionOutput(run: () => unknown, json = false): Promise<string> {
  const output: string[] = [];
  const runtime = createCliRuntime({ debug: false, json, agent: false });
  runtime.output.writeHuman = (text) => output.push(text);
  runtime.output.writeJson = (data) => output.push(JSON.stringify(data));
  runtime.output.writeRaw = (body) => output.push(body);

  await runWithCliRuntime(runtime, run);
  return output.join("");
}

async function runCompletionCommand(
  completionCommand: Command,
  rawArgs: string[],
  json = false,
): Promise<string> {
  const rootCommand = defineCommand({
    metadata: { name: "altertable" },
    subcommands: { completion: completionCommand },
  });
  return await captureCompletionOutput(() => executeCommand(rootCommand, rawArgs), json);
}

async function runCompletion(getRootCommand: () => Command, shell?: string): Promise<string> {
  const completionCommand = createCompletionCommand(getRootCommand);
  const rawArgs = shell ? ["completion", "generate", shell] : ["completion"];
  return await runCompletionCommand(completionCommand, rawArgs);
}

async function runCompletionGenerate(shell: string): Promise<string> {
  const completionCommand = createCompletionCommand(() => minimalRootCommand);
  return await runCompletionCommand(completionCommand, ["completion", "generate", shell]);
}

async function runCompletionParent(rawArgs: string[], json = false): Promise<string> {
  const completionCommand = createCompletionCommand(() => minimalRootCommand);
  return await runCompletionCommand(completionCommand, rawArgs, json);
}

async function runCompletionParentJson(rawArgs: string[]): Promise<string> {
  return await runCompletionParent(rawArgs, true);
}

async function runCompletionInstall(shell?: string, noRc = false): Promise<string> {
  const completionCommand = createCompletionCommand(() => minimalRootCommand);
  const rawArgs = shell ? ["completion", "install", shell] : ["completion", "install"];
  if (noRc) {
    rawArgs.splice(2, 0, "--no-rc");
  }
  return await runCompletionCommand(completionCommand, rawArgs);
}

describe("completion command", () => {
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalXdgDataHome = process.env.XDG_DATA_HOME;

  afterEach(() => {
    if (testHome) {
      rmSync(testHome, { recursive: true, force: true });
      testHome = undefined;
    }
    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalXdgConfigHome) {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    if (originalXdgDataHome) {
      process.env.XDG_DATA_HOME = originalXdgDataHome;
    } else {
      delete process.env.XDG_DATA_HOME;
    }
  });

  test("bash output contains query and api commands", async () => {
    const output = await runCompletion(() => minimalRootCommand, "bash");
    expect(output).toContain("query");
    expect(output).toContain("api");
    expect(output).toContain("_altertable_completions");
    expect(output).toContain("altertable");
  });

  test("bash output contains nested subcommand words", async () => {
    const output = await runCompletion(() => minimalRootCommand, "bash");
    expect(output).toContain("connections");
    expect(output).toContain("catalogs");
    expect(output).toContain("list");
  });

  test("bash output includes leaf command flags from real command tree", async () => {
    const output = await runCompletion(buildMainCommand, "bash");
    expect(output).toContain("--raw-field");
    expect(output).toContain("--field");
    expect(output).toContain("--input");
  });

  test("zsh output contains compdef and nested catalogs create branch", async () => {
    const output = await runCompletion(() => minimalRootCommand, "zsh");
    expect(output).toContain("#compdef altertable");
    expect(output).toContain("altertable");
    expect(output).toContain("catalogs");
    expect(output).toContain("create");
  });

  test("fish output contains fish complete commands and api nesting", async () => {
    const output = await runCompletion(() => minimalRootCommand, "fish");
    expect(output).toContain("altertable fish completion");
    expect(output).toContain("complete -c altertable");
    expect(output).toContain("__altertable_using_context 'api' '0'");
  });

  test("fish output scopes install flags to completion install", async () => {
    const output = await runCompletion(buildMainCommand, "fish");
    expect(output).toContain("__altertable_using_context 'completion/install' 'any'");
    expect(output).toContain("-l no-rc");
  });

  test("fish output includes leaf command flags from real command tree", async () => {
    const output = await runCompletion(buildMainCommand, "fish");
    expect(output).toContain("-l raw-field");
    expect(output).toContain("-l field");
  });

  test("generate command writes explicit shell output", async () => {
    const output = await runCompletionGenerate("fish");
    expect(output).toContain("altertable fish completion");
    expect(output).toContain("altertable completion generate fish");
  });

  test("generate validates values from supported shell metadata", async () => {
    expect(runCompletionGenerate("powershell")).rejects.toThrow(
      "Unsupported shell: powershell. Use bash, fish, zsh.",
    );
  });

  test("bare completion shows guidance without dumping a script", async () => {
    const output = await runCompletion(() => minimalRootCommand);
    const visibleOutput = visibleTerminalText(output);
    expect(visibleOutput).toContain("Shell completion");
    expect(visibleOutput).toContain("altertable completion install");
    expect(visibleOutput).toContain("altertable completion generate zsh");
    expect(visibleOutput).not.toContain("altertable fish completion");
    expect(visibleOutput).not.toContain("_altertable_completions");
  });

  test("bare completion emits guidance as json in json mode", async () => {
    const output = await runCompletionParentJson(["completion"]);
    expect(JSON.parse(output)).toMatchObject({
      install: "altertable completion install",
      manual: "altertable completion generate zsh",
    });
  });

  test("install writes fish completion without startup file changes", async () => {
    const home = setTestHome();
    const output = await runCompletionInstall("fish");
    const completionPath = join(home, ".config", "fish", "completions", "altertable.fish");

    expect(existsSync(completionPath)).toBe(true);
    expect(readFileSync(completionPath, "utf8")).toContain("altertable fish completion");
    const visibleOutput = visibleTerminalText(output);
    expect(visibleOutput).toContain("Shell completion installed");
    expect(visibleOutput).toContain(`Script:  ${completionPath}`);
    expect(visibleOutput).toContain("Startup: automatic");
    expect(visibleOutput).toContain("Docs:    Shell completion");
  });

  test("install writes zsh completion and updates zshrc idempotently", async () => {
    const home = setTestHome();
    await runCompletionInstall("zsh");
    await runCompletionInstall("zsh");

    const completionPath = join(home, ".local", "share", "zsh", "site-functions", "_altertable");
    const zshrcPath = join(home, ".zshrc");
    const zshrc = readFileSync(zshrcPath, "utf8");

    expect(readFileSync(completionPath, "utf8")).toContain("#compdef altertable");
    expect(zshrc).toContain("altertable completion");
    expect(zshrc).toContain("autoload -Uz compinit");
    expect(zshrc.match(/>>> altertable completion/g)).toHaveLength(1);
  });

  test("install can skip shell startup file updates", async () => {
    const home = setTestHome();
    const output = await runCompletionInstall("bash", true);

    expect(
      existsSync(join(home, ".local", "share", "bash-completion", "completions", "altertable")),
    ).toBe(true);
    expect(existsSync(join(home, ".bashrc"))).toBe(false);
    expect(visibleTerminalText(output)).toContain("Startup: left unchanged (--no-rc)");
  });
});
