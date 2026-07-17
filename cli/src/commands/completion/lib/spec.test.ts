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

function findNode(spec: ReturnType<typeof buildCompletionSpec>, name: string) {
  return spec.subcommands.find((node) => node.name === name);
}

describe("buildCompletionSpec", () => {
  test("walks a minimal fake tree", () => {
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

    const spec = buildCompletionSpec(root);
    expect(spec.flags.map((flag) => flag.name)).toEqual(["format", "json"]);
    expect(spec.flags.find((flag) => flag.name === "format")?.values).toEqual(["json", "table"]);
    expect(spec.subcommands).toHaveLength(1);
    expect(spec.subcommands[0]?.name).toBe("alpha");
    expect(spec.subcommands[0]?.subcommands.map((node) => node.name)).toEqual(["sub"]);
    expect(spec.subcommands[0]?.flags.map((flag) => flag.name)).toEqual(["force"]);
  });

  test("skips nested commands without meta.name", () => {
    const root = defineCommand({
      subCommands: {
        visible: { meta: { name: "visible" } },
        hidden: { meta: { description: "no name" } },
      },
    });

    const spec = buildCompletionSpec(root);
    expect(spec.subcommands.map((command) => command.name)).toEqual(["visible"]);
  });

  test("skips commands marked hidden", () => {
    const root = defineCommand({
      subCommands: {
        visible: { meta: { name: "visible" } },
        hidden: { meta: { name: "hidden", hidden: true } },
      },
    });

    const spec = buildCompletionSpec(root);
    expect(spec.subcommands.map((command) => command.name)).toEqual(["visible"]);
  });

  test("real root command includes expected top-level and nested commands", () => {
    const spec = buildCompletionSpec(buildMainCommand());
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

  test("includes completion top-level command", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    expect(findNode(spec, "completion")).toBeDefined();
  });

  test("extracts root json flag", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    expect(spec.flags.some((flag) => flag.name === "json")).toBe(true);
    expect(spec.flags.some((flag) => flag.name === "debug")).toBe(true);
  });

  test("extracts fixed flag values from real commands", () => {
    const spec = buildCompletionSpec(buildMainCommand());
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

  test("sorts subcommands alphabetically", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const names = spec.subcommands.map((command) => command.name);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
  });
});

describe("completion format helpers", () => {
  test("groupCompletionContextsByTopLevel groups by first segment", () => {
    const spec = buildCompletionSpec(buildMainCommand());
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
  test("includes nested case blocks", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("api)");
    expect(output).toContain("--method");
    expect(output).toContain("catalogs");
  });

  test("includes leaf command flags", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("--raw-field");
    expect(output).toContain("--field");
    expect(output).toContain("--input");
  });

  test("includes flag value completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("_altertable_complete_flag_value");
    expect(output).toContain('"--layout=auto,table,line"');
    expect(output).toContain('"--pager=auto,always,never"');
  });
});

describe("collectCompletionContexts", () => {
  test("returns leaf contexts with flags and no subcommands", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const contexts = collectCompletionContexts(spec);

    const api = contexts.find((context) => context.segments.join("/") === "api");
    expect(api?.flags.some((flag) => flag.name === "field")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "input")).toBe(true);
    expect(api?.subcommands).toEqual(["routes", "spec"]);
  });
});

describe("formatFishCompletion", () => {
  test("includes scoped leaf flag completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatFishCompletion(spec);
    expect(output).toContain("-l field");
  });

  test("includes flag value completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatFishCompletion(spec);
    expect(output).toContain(
      "-l layout -d 'Human layout: auto, table, or line' -f -r -a \"auto table line\"",
    );
  });
});

describe("formatZshCompletion", () => {
  test("includes leaf flag completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatZshCompletion(spec);
    expect(output).toContain("--field");
    expect(output).toContain("--input");
  });

  test("includes flag value completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatZshCompletion(spec);
    expect(output).toContain(":layout:(auto table line)");
    expect(output).toContain(":pager:(auto always never)");
  });
});
