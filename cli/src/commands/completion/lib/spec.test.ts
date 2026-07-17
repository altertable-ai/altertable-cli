import { describe, expect, test } from "bun:test";
import { defineCommand } from "@/lib/command.ts";
import { buildMainCommand } from "@/cli.ts";
import { buildCompletionSpec, collectCompletionContexts } from "@/commands/completion/lib/spec.ts";
import {
  formatBashCompletion,
  formatBashFlagWordList,
  formatFishCompletion,
  formatFishPathCondition,
  formatZshCompletion,
  groupCompletionContextsByTopLevel,
  mergeCompletionFlags,
} from "@/commands/completion/lib/format.ts";

type CompletionSpec = Awaited<ReturnType<typeof buildCompletionSpec>>;

function findNode(spec: CompletionSpec, name: string) {
  return spec.subcommands.find((node) => node.name === name);
}

function findChild(node: CompletionSpec | undefined, name: string) {
  return node?.subcommands.find((child) => child.name === name);
}

function bashQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function runBashCompletion(words: string[]): Promise<string[]> {
  const script = formatBashCompletion(await buildCompletionSpec(buildMainCommand()));
  const source = `${script}
COMP_WORDS=(${words.map(bashQuote).join(" ")})
COMP_CWORD=${words.length - 1}
COMPREPLY=()
_altertable_completions
printf '%s\\n' "\${COMPREPLY[@]}"
`;
  const result = Bun.spawnSync(["bash", "-c", source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return new TextDecoder().decode(result.stdout).trim().split("\n").filter(Boolean);
}

describe("buildCompletionSpec", () => {
  test("walks a minimal fake tree", async () => {
    const root = defineCommand({
      meta: { name: "altertable" },
      args: {
        json: { type: "boolean", description: "Output raw JSON" },
        format: { type: "enum", options: ["json", "table"] },
      },
      subCommands: {
        alpha: {
          meta: { name: "alpha", description: "Alpha command" },
          args: {
            force: { type: "boolean", alias: "f" },
          },
          subCommands: {
            sub: {
              meta: { name: "sub" },
            },
          },
        },
      },
    });

    const spec = await buildCompletionSpec(root);
    expect(spec.flags.map((flag) => flag.name)).toEqual(["format", "json"]);
    expect(spec.flags.find((flag) => flag.name === "format")?.values).toEqual(["json", "table"]);
    expect(spec.subcommands).toHaveLength(1);
    expect(spec.subcommands[0]?.name).toBe("alpha");
    expect(spec.subcommands[0]?.subcommands.map((node) => node.name)).toEqual(["sub"]);
    expect(spec.subcommands[0]?.flags.map((flag) => flag.name)).toEqual(["force"]);
  });

  test("skips nested commands without meta.name", async () => {
    const root = defineCommand({
      subCommands: {
        visible: { meta: { name: "visible" } },
        hidden: { meta: { description: "no name" } },
      },
    });

    const spec = await buildCompletionSpec(root);
    expect(spec.subcommands.map((command) => command.name)).toEqual(["visible"]);
  });

  test("skips commands marked hidden", async () => {
    const root = defineCommand({
      subCommands: {
        visible: { meta: { name: "visible" } },
        hidden: { meta: { name: "hidden", hidden: true } },
      },
    });

    const spec = await buildCompletionSpec(root);
    expect(spec.subcommands.map((command) => command.name)).toEqual(["visible"]);
  });

  test("resolves asynchronous command metadata", async () => {
    const root = defineCommand({
      meta: async () => ({ name: "altertable" }),
      subCommands: {
        generated: defineCommand({
          meta: async () => ({
            name: "generated",
            description: "Generated command",
          }),
        }),
      },
    });

    const spec = await buildCompletionSpec(root);

    expect(spec.name).toBe("altertable");
    expect(spec.subcommands).toEqual([
      expect.objectContaining({
        name: "generated",
        description: "Generated command",
      }),
    ]);
  });

  test("real root command includes expected top-level and nested commands", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const catalogs = findNode(spec, "catalogs");
    const api = findNode(spec, "api");

    expect(findNode(spec, "query")).toBeDefined();
    expect(findNode(spec, "update")).toBeDefined();
    expect(findNode(spec, "upgrade")).toBeDefined();
    expect(spec.flags.some((flag) => flag.name === "agent")).toBe(true);
    expect(catalogs).toBeDefined();
    expect(api).toBeDefined();
    expect(findNode(spec, "connections")).toBeUndefined();
    expect(catalogs?.subcommands.map((node) => node.name)).toEqual(["create"]);
    expect(api?.subcommands.map((node) => node.name)).toEqual(["routes", "spec"]);
    expect(api?.flags.some((flag) => flag.name === "method")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "raw-field")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "field")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "input")).toBe(true);
  });

  test("includes completion top-level command", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    expect(findNode(spec, "completion")).toBeDefined();
  });

  test("extracts root json flag", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    expect(spec.flags.some((flag) => flag.name === "json")).toBe(true);
    expect(spec.flags.some((flag) => flag.name === "debug")).toBe(true);
  });

  test("extracts fixed flag values from real commands", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const query = findNode(spec, "query");

    expect(query?.flags.find((flag) => flag.name === "layout")?.values).toEqual([
      "auto",
      "table",
      "line",
    ]);
    expect(query?.flags.find((flag) => flag.name === "pager")?.values).toEqual([
      "auto",
      "always",
      "never",
    ]);
  });

  test("extracts finite shell positional values from completion commands", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const completion = findNode(spec, "completion");

    expect(findChild(completion, "generate")?.positionals).toEqual([
      expect.objectContaining({
        name: "shell",
        required: true,
        values: ["bash", "fish", "zsh"],
      }),
    ]);
    expect(findChild(completion, "install")?.positionals).toEqual([
      expect.objectContaining({
        name: "shell",
        required: false,
        values: ["bash", "fish", "zsh"],
      }),
    ]);
  });

  test("sorts subcommands alphabetically", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const names = spec.subcommands.map((command) => command.name);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
  });
});

describe("completion format helpers", () => {
  test("groupCompletionContextsByTopLevel groups by first segment", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const contexts = collectCompletionContexts(spec);
    const grouped = groupCompletionContextsByTopLevel(contexts);

    expect(grouped.get("api")?.some((context) => context.segments.length === 1)).toBe(true);
  });

  test("mergeCompletionFlags preserves node flags before root flags", () => {
    const merged = mergeCompletionFlags([{ name: "label" }], [{ name: "json" }, { name: "debug" }]);
    expect(merged.map((flag) => flag.name)).toEqual(["label", "json", "debug"]);
  });

  test("formatBashFlagWordList includes short and long flag forms", () => {
    expect(formatBashFlagWordList([{ name: "json" }, { name: "force", alias: "f" }])).toBe(
      "--json -f --force",
    );
  });

  test("formatFishPathCondition scopes subcommands and flags", () => {
    expect(formatFishPathCondition(["api"], ["spec", "routes"])).toBe(
      "__fish_seen_subcommand_from api; and not __fish_seen_subcommand_from spec routes",
    );
  });
});

describe("formatBashCompletion", () => {
  test("includes nested case blocks", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("api)");
    expect(output).toContain("--method");
    expect(output).toContain("catalogs");
  });

  test("includes leaf command flags", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("--raw-field");
    expect(output).toContain("--field");
    expect(output).toContain("--input");
  });

  test("includes flag value completions", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("_altertable_complete_flag_value");
    expect(output).toContain('"--layout=auto,table,line"');
    expect(output).toContain('"--pager=auto,always,never"');
  });

  test("includes finite positional value completions", async () => {
    const output = formatBashCompletion(await buildCompletionSpec(buildMainCommand()));
    expect(output).toContain('compgen -W "bash fish zsh"');
  });

  test("routes around every global flag in every command position", async () => {
    const globalFlagForms = [
      ["--debug"],
      ["-d"],
      ["--json"],
      ["--agent"],
      ["--no-color"],
      ["--profile", "production"],
      ["--profile=production"],
      ["--connect-timeout", "5"],
      ["--connect-timeout=5"],
      ["--read-timeout", "60"],
      ["--read-timeout=60"],
    ];

    for (const globalFlag of globalFlagForms) {
      const invocations = [
        ["altertable", ...globalFlag, "completion", "generate", ""],
        ["altertable", "completion", ...globalFlag, "generate", ""],
        ["altertable", "completion", "generate", ...globalFlag, ""],
      ];
      for (const invocation of invocations) {
        expect(await runBashCompletion(invocation)).toEqual(["bash", "fish", "zsh"]);
      }
    }
  });

  test("completes finite positionals after command flags", async () => {
    expect(await runBashCompletion(["altertable", "completion", "install", "--no-rc", ""])).toEqual(
      ["bash", "fish", "zsh"],
    );
  });
});

describe("collectCompletionContexts", () => {
  test("returns leaf contexts with flags and no subcommands", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const contexts = collectCompletionContexts(spec);

    const api = contexts.find((context) => context.segments.join("/") === "api");
    expect(api?.flags.some((flag) => flag.name === "field")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "input")).toBe(true);
    expect(api?.subcommands).toEqual(["routes", "spec"]);
  });
});

describe("formatFishCompletion", () => {
  test("includes scoped leaf flag completions", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatFishCompletion(spec);
    expect(output).toContain("-l field");
  });

  test("includes flag value completions", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatFishCompletion(spec);
    expect(output).toContain(
      "-l layout -d 'Human layout: auto, table, or line' -f -r -a \"auto table line\"",
    );
  });

  test("includes finite positional value completions", async () => {
    const output = formatFishCompletion(await buildCompletionSpec(buildMainCommand()));
    expect(output).toContain('-a "bash fish zsh"');
  });
});

describe("formatZshCompletion", () => {
  test("includes leaf flag completions", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatZshCompletion(spec);
    expect(output).toContain("--field");
    expect(output).toContain("--input");
  });

  test("includes flag value completions", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatZshCompletion(spec);
    expect(output).toContain(":layout:(auto table line)");
    expect(output).toContain(":pager:(auto always never)");
  });

  test("includes finite positional value completions", async () => {
    const output = formatZshCompletion(await buildCompletionSpec(buildMainCommand()));
    expect(output).toContain("_values 'shell' bash fish zsh");
  });
});
