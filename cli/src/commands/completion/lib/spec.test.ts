import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { buildMainCommand } from "@/cli.ts";
import { buildCompletionSpec, collectCompletionContexts } from "@/commands/completion/lib/spec.ts";
import {
  buildCompletionModel,
  findCompletionContext,
  normalizeCompletionArgv,
} from "@/commands/completion/lib/model.ts";
import {
  formatBashCompletion,
  formatBashFlagWordList,
  formatFishCompletion,
  formatFishPathCondition,
  formatZshCompletion,
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

function fishCommand(words: readonly string[]): string {
  return words
    .map(
      (word) => `"${word.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$")}"`,
    )
    .join(" ");
}

function parseCompletionOutput(output: Uint8Array): string[] {
  return new TextDecoder()
    .decode(output)
    .trim()
    .split("\n")
    .map((line) => line.split("\t")[0] ?? "")
    .filter(Boolean);
}

async function runBashCompletion(words: string[], cwd?: string): Promise<string[]> {
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
    ...(cwd ? { cwd } : {}),
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return parseCompletionOutput(result.stdout);
}

async function runZshCompletion(words: string[]): Promise<string[]> {
  const script = formatZshCompletion(await buildCompletionSpec(buildMainCommand()));
  const source = `${script}
compadd() {
  local afterSeparator=0
  local argument
  for argument in "$@"; do
    if (( afterSeparator )); then
      print -r -- "\${argument}"
    elif [[ "\${argument}" == "--" ]]; then
      afterSeparator=1
    fi
  done
}
_files() {
  local candidate
  for candidate in \${PREFIX}*(N); do
    compadd -- "\${candidate}"
  done
}
words=(${words.map(bashQuote).join(" ")})
CURRENT=${words.length}
PREFIX="\${words[CURRENT]}"
_altertable
`;
  const result = Bun.spawnSync(["zsh", "-f", "-c", source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return parseCompletionOutput(result.stdout);
}

async function runFishCompletion(words: string[]): Promise<string[]> {
  const script = formatFishCompletion(await buildCompletionSpec(buildMainCommand()));
  const source = `${script}
complete -C "$argv[1]"
`;
  const result = Bun.spawnSync(["fish", "-c", source, fishCommand(words)], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return parseCompletionOutput(result.stdout);
}

const completionRunners = {
  bash: runBashCompletion,
  fish: runFishCompletion,
  zsh: runZshCompletion,
};

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

describe("buildCompletionSpec", () => {
  test("walks a minimal fake tree", async () => {
    const root = defineCommand({
      metadata: { name: "altertable" },
      args: {
        json: { type: "boolean", description: "Output raw JSON" },
        format: { type: "enum", options: ["json", "table"] },
      },
      subcommands: {
        alpha: {
          metadata: { name: "alpha", description: "Alpha command" },
          args: {
            force: { type: "boolean", alias: "f" },
          },
          subcommands: {
            sub: {
              metadata: { name: "sub" },
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
      subcommands: {
        visible: { metadata: { name: "visible" } },
        hidden: { metadata: { description: "no name" } },
      },
    });

    const spec = await buildCompletionSpec(root);
    expect(spec.subcommands.map((command) => command.name)).toEqual(["visible"]);
  });

  test("skips commands marked hidden", async () => {
    const root = defineCommand({
      subcommands: {
        visible: { metadata: { name: "visible" } },
        hidden: { metadata: { name: "hidden", hidden: true } },
      },
    });

    const spec = await buildCompletionSpec(root);
    expect(spec.subcommands.map((command) => command.name)).toEqual(["visible"]);
  });

  test("resolves asynchronous command metadata", async () => {
    const root = defineCommand({
      metadata: async () => ({ name: "altertable" }),
      subcommands: {
        generated: defineCommand({
          metadata: async () => ({
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
    expect(spec.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "help", alias: "h", scope: "global" }),
        expect.objectContaining({ name: "version", alias: "v", scope: "root-only" }),
      ]),
    );
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

  test("extracts intentional direct and subcommand operand collisions", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());

    expect(findNode(spec, "query")?.soleDirectOperands).toEqual(["show"]);
  });

  test("extracts finite shell positional values from completion commands", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const completion = findNode(spec, "completion");

    expect(findChild(completion, "generate")?.positionals).toEqual([
      expect.objectContaining({
        name: "shell",
        required: true,
        completion: "finite",
        values: ["bash", "fish", "zsh"],
      }),
    ]);
    expect(findChild(completion, "install")?.positionals).toEqual([
      expect.objectContaining({
        name: "shell",
        required: false,
        completion: "finite",
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
  test("mergeCompletionFlags preserves node flags before root flags", () => {
    const merged = mergeCompletionFlags([{ name: "label" }], [{ name: "json" }, { name: "debug" }]);
    expect(merged.map((flag) => flag.name)).toEqual(["label", "json", "debug"]);
  });

  test("formatBashFlagWordList includes short and long flag forms", () => {
    expect(formatBashFlagWordList([{ name: "json" }, { name: "force", alias: "f" }])).toBe(
      "--json -f --force",
    );
  });

  test("formatFishPathCondition uses normalized path and positional state", () => {
    expect(formatFishPathCondition(["api"], 1)).toBe("__altertable_using_context 'api' '1'");
  });
});

describe("normalized completion argv", () => {
  test("resolves command paths independently from flags and direct operands", async () => {
    const model = buildCompletionModel(await buildCompletionSpec(buildMainCommand()));
    const matrix = [
      {
        argv: ["--profile", "production", "query", "SELECT 1"],
        path: ["query"],
        positionals: ["SELECT 1"],
      },
      {
        argv: ["query", "--profile=production", "show", "qry_123"],
        path: ["query", "show"],
        positionals: ["qry_123"],
      },
      {
        argv: ["query", "show", "--layout", "table"],
        path: ["query"],
        positionals: ["show"],
      },
      {
        argv: ["query", "show", "--help"],
        path: ["query", "show"],
        positionals: [],
      },
      {
        argv: ["append", '{"event":"checkout"}', "--sync"],
        path: ["append"],
        positionals: ['{"event":"checkout"}'],
      },
      {
        argv: ["api", "/whoami", "-X", "GET"],
        path: ["api"],
        positionals: ["/whoami"],
      },
      {
        argv: ["completion", "install", "--no-rc"],
        path: ["completion", "install"],
        positionals: [],
      },
      {
        argv: ["query", "--", "show"],
        path: ["query"],
        positionals: ["show"],
      },
    ];

    for (const entry of matrix) {
      const normalized = normalizeCompletionArgv(model, entry.argv);
      expect(normalized.commandPath).toEqual(entry.path);
      expect(normalized.positionals).toEqual(entry.positionals);
      expect(findCompletionContext(model, normalized.commandPath)).toBeDefined();
    }
  });

  test("tracks a pending value for global and command flags", async () => {
    const model = buildCompletionModel(await buildCompletionSpec(buildMainCommand()));

    expect(normalizeCompletionArgv(model, ["query", "--profile"]).expectsFlagValue).toBe(true);
    expect(normalizeCompletionArgv(model, ["query", "--layout"]).expectsFlagValue).toBe(true);
    expect(normalizeCompletionArgv(model, ["query", "--layout=table"]).expectsFlagValue).toBe(
      false,
    );
  });
});

describe("formatBashCompletion", () => {
  test("includes nested case blocks", async () => {
    const spec = await buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("'api')");
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
    expect(output).toContain('compgen -W "bash fish zsh --');
  });

  test("completes finite positionals after command flags", async () => {
    expect(await runBashCompletion(["altertable", "completion", "install", "--no-rc", ""])).toEqual(
      expect.arrayContaining(["bash", "fish", "zsh"]),
    );
  });

  test("preserves whitespace in file and directory candidates", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "altertable-bash-completion-"));
    writeFileSync(join(cwd, "order data.csv"), "");
    mkdirSync(join(cwd, "order exports"));

    try {
      expect(await runBashCompletion(["altertable", "upload", "order"], cwd)).toEqual(
        expect.arrayContaining(["order data.csv", "order exports"]),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
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
    expect(output).toContain('"--layout=auto,table,line"');
    expect(output).toContain('"--pager=auto,always,never"');
  });

  test("includes finite positional value completions", async () => {
    const output = formatZshCompletion(await buildCompletionSpec(buildMainCommand()));
    expect(output).toContain("_altertable_add_words bash fish zsh");
  });
});

describe("executable shell completion contract", () => {
  for (const [shell, runCompletion] of Object.entries(completionRunners)) {
    test(`${shell} routes direct operands to trailing flags`, async () => {
      expect(await runCompletion(["altertable", "query", "SELECT 1", "--"])).toContain("--layout");
      expect(await runCompletion(["altertable", "append", '{"event":"checkout"}', "--"])).toContain(
        "--to",
      );
      expect(await runCompletion(["altertable", "api", "/whoami", "--"])).toContain("--method");
    });

    test(`${shell} resolves nested commands without raw word indexes`, async () => {
      const candidates = await runCompletion([
        "altertable",
        "--json",
        "query",
        "show",
        "qry_1",
        "--",
      ]);
      expect(candidates).toContain("--profile");
      expect(candidates).not.toContain("--layout");
    });

    test(`${shell} preserves intentional direct operands with trailing flags`, async () => {
      const direct = await runCompletion([
        "altertable",
        "query",
        "show",
        "--layout",
        "table",
        "--",
      ]);
      expect(direct).toContain("--columns");
      expect(direct).toContain("--layout");

      const nested = await runCompletion(["altertable", "query", "show", "qry_1", "--"]);
      expect(nested).not.toContain("--columns");
      expect(nested).not.toContain("--layout");
    });

    test(`${shell} completes and exhausts finite positional values`, async () => {
      expect(await runCompletion(["altertable", "completion", "install", "--no-rc", ""])).toEqual(
        expect.arrayContaining(["bash", "fish", "zsh"]),
      );

      const exhausted = await runCompletion(["altertable", "completion", "install", "zsh", ""]);
      for (const shellValue of ["bash", "fish", "zsh"]) {
        expect(exhausted).not.toContain(shellValue);
      }
      expect(await runCompletion(["altertable", "completion", "install", "zsh", "--"])).toContain(
        "--no-rc",
      );
    });

    test(`${shell} composes flags with pending positional candidates`, async () => {
      const candidates = await runCompletion(["altertable", "completion", "install", "--"]);
      expect(candidates).toEqual(
        expect.arrayContaining(["--no-rc", "--json", "--profile", "--help"]),
      );
      expect(candidates).not.toContain("--version");
      expect(await runCompletion(["altertable", "--"])).toContain("--version");
    });

    test(`${shell} completes file positionals`, async () => {
      expect(await runCompletion(["altertable", "upload", "package.j"])).toContain("package.json");
      expect(await runCompletion(["altertable", "upsert", "package.j"])).toContain("package.json");
    });

    test(`${shell} handles global flags in every position and equals values`, async () => {
      for (const globalFlag of globalFlagForms) {
        const invocations = [
          ["altertable", ...globalFlag, "completion", "generate", ""],
          ["altertable", "completion", ...globalFlag, "generate", ""],
          ["altertable", "completion", "generate", ...globalFlag, ""],
        ];
        for (const invocation of invocations) {
          expect(await runCompletion(invocation)).toEqual(
            expect.arrayContaining(["bash", "fish", "zsh"]),
          );
        }
      }
    });

    test(`${shell} completes finite flag values`, async () => {
      expect(await runCompletion(["altertable", "query", "--layout", ""])).toEqual(
        expect.arrayContaining(["auto", "table", "line"]),
      );
    });

    test(`${shell} honors the option separator`, async () => {
      expect(await runCompletion(["altertable", "completion", "generate", "--", ""])).toEqual(
        expect.arrayContaining(["bash", "fish", "zsh"]),
      );
    });
  }
});
