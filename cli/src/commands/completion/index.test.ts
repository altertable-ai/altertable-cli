import { describe, expect, test } from "bun:test";
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
    catalog: {
      metadata: { name: "catalog" },
      subcommands: {
        list: { metadata: { name: "list" } },
        create: { metadata: { name: "create" } },
      },
    },
    completion: { metadata: { name: "completion" } },
  },
});

function visibleTerminalText(text: string): string {
  return text.replace(TERMINAL_CONTROL_PATTERN, "");
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

describe("completion command", () => {
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
    expect(output).toContain("catalog");
    expect(output).toContain("list");
  });

  test("bash output includes leaf command flags from real command tree", async () => {
    const output = await runCompletion(buildMainCommand, "bash");
    expect(output).toContain("--raw-field");
    expect(output).toContain("--field");
    expect(output).toContain("--input");
  });

  test("zsh output contains compdef and nested catalog create branch", async () => {
    const output = await runCompletion(() => minimalRootCommand, "zsh");
    expect(output).toContain("#compdef altertable");
    expect(output).toContain("altertable");
    expect(output).toContain("catalog");
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
});
