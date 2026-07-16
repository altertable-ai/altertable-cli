import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCommand, type Command } from "@/lib/command.ts";
import { buildMainCommand } from "@/cli.ts";
import { createCompletionCommand } from "@/commands/completion/index.ts";
import type { ConfigurePrompts } from "@/lib/profile-configure-interactive.ts";
import { buildCompletionSpec, flattenTopLevelNames } from "@/commands/completion/lib/spec.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

const TERMINAL_CONTROL_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m|${String.fromCharCode(27)}\\]8;;[^\\u0007]*\\u0007`,
  "g",
);

const minimalRootCommand = defineCommand({
  meta: { name: "altertable" },
  args: {
    json: { type: "boolean", description: "Output raw JSON responses" },
    debug: { type: "boolean", alias: "d", description: "Enable debug output" },
  },
  subCommands: {
    query: { meta: { name: "query" } },
    api: {
      meta: { name: "api" },
      subCommands: {
        connections: {
          meta: { name: "connections" },
          subCommands: {
            list: { meta: { name: "list" } },
          },
        },
      },
    },
    catalogs: {
      meta: { name: "catalogs" },
      subCommands: {
        list: { meta: { name: "list" } },
        create: { meta: { name: "create" } },
      },
    },
    completion: { meta: { name: "completion" } },
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

function createMockPrompts(selection: string): ConfigurePrompts {
  return {
    writePrompt() {},
    readLine: async () => "",
    readPassword: async () => "",
    readSelect: async () => selection,
    readConfirm: async () => true,
  };
}

async function captureCompletionOutput(
  run: () => void | Promise<void>,
  json = false,
): Promise<string> {
  const output: string[] = [];
  const runtime = createCliRuntime({ debug: false, json, agent: false });
  runtime.output.writeHuman = (text) => output.push(text);
  runtime.output.writeJson = (data) => output.push(JSON.stringify(data));
  runtime.output.writeRaw = (body) => output.push(body);

  await runWithCliRuntime(runtime, run);
  return output.join("");
}

async function runCompletion(
  getRootCommand: () => Command,
  shell?: string,
  prompts?: ConfigurePrompts,
): Promise<string> {
  const completionCommand = createCompletionCommand(getRootCommand, { prompts });
  const supportedShells = new Set(["bash", "zsh", "fish"]);
  const command =
    shell === undefined || !supportedShells.has(shell)
      ? completionCommand
      : (completionCommand.subCommands as Record<string, Command> | undefined)?.[shell];
  if (!command?.run) {
    throw new Error(`missing completion command for ${shell ?? "detected shell"}`);
  }

  const rawArgs = shell ? ["completion", shell] : ["completion"];
  return await captureCompletionOutput(() =>
    command.run?.({ args: command === completionCommand ? { shell } : {}, rawArgs } as never),
  );
}

async function runCompletionGenerate(shell: string): Promise<string> {
  const completionCommand = createCompletionCommand(() => minimalRootCommand);
  const generateCommand = (completionCommand.subCommands as Record<string, Command> | undefined)
    ?.generate;
  const command = (generateCommand?.subCommands as Record<string, Command> | undefined)?.[shell];
  if (!command?.run) {
    throw new Error("missing completion generate command");
  }

  return await captureCompletionOutput(() =>
    command.run?.({
      args: {},
      rawArgs: ["completion", "generate", shell],
    } as never),
  );
}

async function runCompletionParent(rawArgs: string[], json = false): Promise<string> {
  const completionCommand = createCompletionCommand(() => minimalRootCommand);
  if (!completionCommand.run) {
    throw new Error("missing completion command");
  }

  return await captureCompletionOutput(
    () =>
      completionCommand.run?.({
        args: {},
        rawArgs,
      } as never),
    json,
  );
}

async function runCompletionParentJson(rawArgs: string[]): Promise<string> {
  return await runCompletionParent(rawArgs, true);
}

async function runCompletionInstall(shell?: string, noRc = false): Promise<string> {
  const completionCommand = createCompletionCommand(() => minimalRootCommand);
  const installCommand = (completionCommand.subCommands as Record<string, Command> | undefined)
    ?.install;
  const command =
    shell === undefined
      ? installCommand
      : (installCommand?.subCommands as Record<string, Command> | undefined)?.[shell];
  if (!command?.run) {
    throw new Error("missing completion install command");
  }

  const rawArgs = shell ? ["completion", "install", shell] : ["completion", "install"];
  if (noRc) {
    rawArgs.push("--no-rc");
  }
  return await captureCompletionOutput(() =>
    command.run?.({
      args: shell === undefined ? { shell, "no-rc": noRc } : { "no-rc": noRc },
      rawArgs,
    } as never),
  );
}

async function runInteractiveCompletion(selection: string, shellPath?: string): Promise<string> {
  const originalShell = process.env.SHELL;
  const originalIsTTY = process.stdin.isTTY;
  if (shellPath) {
    process.env.SHELL = shellPath;
  } else {
    delete process.env.SHELL;
  }
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  try {
    return await runCompletion(() => minimalRootCommand, undefined, createMockPrompts(selection));
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    if (originalShell) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
  }
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
    expect(output).toContain("--body");
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
    expect(output).toContain("__fish_seen_subcommand_from api");
  });

  test("fish output suggests shells after completion install", async () => {
    const output = await runCompletion(buildMainCommand, "fish");
    expect(output).toContain(
      "__fish_seen_subcommand_from completion; and __fish_seen_subcommand_from install",
    );
    expect(output).toContain('-a "bash fish zsh"');
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

  test("parent completion does not print help after delegated subcommands", async () => {
    const output = await runCompletionParent(["completion", "generate", "fish"]);
    expect(output).toBe("");
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

  test("interactive completion can install detected shell", async () => {
    const home = setTestHome();
    const output = await runInteractiveCompletion("install", "/opt/homebrew/bin/fish");
    const completionPath = join(home, ".config", "fish", "completions", "altertable.fish");

    expect(existsSync(completionPath)).toBe(true);
    expect(readFileSync(completionPath, "utf8")).toContain("altertable fish completion");
    expect(visibleTerminalText(output)).toContain("Shell completion installed");
  });

  test("interactive completion shows manual commands without printing a script", async () => {
    const output = await runInteractiveCompletion("help");
    const visibleOutput = visibleTerminalText(output);
    expect(visibleOutput).toContain("altertable completion generate zsh");
    expect(visibleOutput).not.toContain("#compdef altertable");
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

  test("integration root command top-level count matches registry", async () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = await runCompletion(buildMainCommand, "bash");
    const topLevelCount = flattenTopLevelNames(spec).length;
    expect(topLevelCount).toBe(14);
    expect(output).toContain("completion");
    expect(output).toContain("upgrade");
    expect(output).toContain("GET");
  });
});
