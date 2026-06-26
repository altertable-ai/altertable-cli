import { describe, expect, test } from "bun:test";
import type { CommandDef } from "citty";
import { buildMainCommand } from "@/cli.ts";
import { createCompletionCommand } from "@/commands/completion.ts";
import { buildCompletionSpec, flattenTopLevelNames } from "@/lib/completion-spec.ts";
import { CliError } from "@/lib/errors.ts";

const minimalRootCommand: CommandDef = {
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
};

async function runCompletion(getRootCommand: () => CommandDef, shell?: string): Promise<string> {
  const completionCommand = createCompletionCommand(getRootCommand);
  let output = "";
  const originalLog = console.log;
  const rawArgs = shell ? ["completion", shell] : ["completion"];
  console.log = (value?: unknown) => {
    if (typeof value === "string") {
      output += value;
    }
  };
  try {
    await completionCommand.run?.({ args: { shell }, rawArgs } as never);
  } finally {
    console.log = originalLog;
  }
  return output;
}

async function runCompletionWithShellEnv(shellPath: string | undefined): Promise<string> {
  const originalShell = process.env.SHELL;
  if (shellPath) {
    process.env.SHELL = shellPath;
  } else {
    delete process.env.SHELL;
  }
  try {
    return await runCompletion(() => minimalRootCommand);
  } finally {
    if (originalShell) {
      process.env.SHELL = originalShell;
    } else {
      delete process.env.SHELL;
    }
  }
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

  test("fish output includes leaf command flags from real command tree", async () => {
    const output = await runCompletion(buildMainCommand, "fish");
    expect(output).toContain("-l raw-field");
    expect(output).toContain("-l field");
  });

  test("defaults to detected shell", async () => {
    const output = await runCompletionWithShellEnv("/opt/homebrew/bin/fish");
    expect(output).toContain("altertable fish completion");
  });

  test("unknown shell throws CliError", async () => {
    return expect(runCompletion(() => minimalRootCommand, "powershell")).rejects.toThrow(CliError);
  });

  test("missing shell and unsupported environment throws CliError", async () => {
    return expect(runCompletionWithShellEnv(undefined)).rejects.toThrow(CliError);
  });

  test("integration root command top-level count matches registry", async () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = await runCompletion(buildMainCommand, "bash");
    const topLevelCount = flattenTopLevelNames(spec).length;
    expect(topLevelCount).toBeGreaterThan(10);
    expect(output).toContain("completion");
    expect(output).toContain("GET");
  });
});
