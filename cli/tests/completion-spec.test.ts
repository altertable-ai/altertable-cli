import { describe, expect, test } from "bun:test";
import type { CommandDef } from "citty";
import { buildMainCommand } from "@/cli.ts";
import {
  buildCompletionSpec,
  collectCompletionContexts,
  flattenTopLevelNames,
} from "@/lib/completion-spec.ts";
import {
  formatBashCompletion,
  formatBashFlagWordList,
  formatFishCompletion,
  formatFishPathCondition,
  formatZshCompletion,
  groupCompletionContextsByTopLevel,
  mergeCompletionFlags,
} from "@/lib/completion-format.ts";

function findNode(spec: ReturnType<typeof buildCompletionSpec>, name: string) {
  return spec.subcommands.find((node) => node.name === name);
}

describe("buildCompletionSpec", () => {
  test("walks a minimal fake tree", () => {
    const root: CommandDef = {
      meta: { name: "altertable" },
      args: {
        json: { type: "boolean", description: "Output raw JSON" },
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
    };

    const spec = buildCompletionSpec(root);
    expect(spec.flags.map((flag) => flag.name)).toEqual(["json"]);
    expect(spec.subcommands).toHaveLength(1);
    expect(spec.subcommands[0]?.name).toBe("alpha");
    expect(spec.subcommands[0]?.subcommands.map((node) => node.name)).toEqual(["sub"]);
    expect(spec.subcommands[0]?.flags.map((flag) => flag.name)).toEqual(["force"]);
  });

  test("skips nested commands without meta.name", () => {
    const root: CommandDef = {
      subCommands: {
        visible: { meta: { name: "visible" } },
        hidden: { meta: { description: "no name" } },
      },
    };

    const spec = buildCompletionSpec(root);
    expect(flattenTopLevelNames(spec)).toEqual(["visible"]);
  });

  test("real root command includes expected top-level and nested commands", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const catalogs = findNode(spec, "catalogs");
    const api = findNode(spec, "api");
    const apiDocs = findNode(spec, "api-docs");

    expect(findNode(spec, "query")).toBeDefined();
    expect(findNode(spec, "agent")).toBeUndefined();
    expect(catalogs).toBeDefined();
    expect(api).toBeDefined();
    expect(apiDocs).toBeDefined();
    expect(findNode(spec, "connections")).toBeUndefined();
    expect(catalogs?.subcommands.map((node) => node.name)).toEqual(["create", "list"]);
    // api is now a pure path invoker with no subcommands
    expect(api?.subcommands).toEqual([]);
    // api-docs carries the OpenAPI inspection commands
    expect(apiDocs?.subcommands.map((node) => node.name)).toEqual(["routes", "spec"]);

    // api flags: method (-X), raw-field, field, body, header (-H), include (-i)
    expect(api?.flags.some((flag) => flag.name === "method")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "raw-field")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "field")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "body")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "header")).toBe(true);
    expect(api?.flags.some((flag) => flag.name === "include")).toBe(true);
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

  test("sorts subcommands alphabetically", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const names = flattenTopLevelNames(spec);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
  });
});

describe("completion format helpers", () => {
  test("groupCompletionContextsByTopLevel groups by first segment", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const contexts = collectCompletionContexts(spec);
    const grouped = groupCompletionContextsByTopLevel(contexts);

    // api-docs has spec and routes children; api itself is a leaf (no children)
    expect(grouped.get("api-docs")?.some((context) => context.segments[1] === "spec")).toBe(true);
    expect(grouped.get("api-docs")?.some((context) => context.segments[1] === "routes")).toBe(true);
    expect(grouped.get("api")).toBeDefined();
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
    expect(formatFishPathCondition(["api", "GET"], ["spec", "routes"])).toBe(
      "__fish_seen_subcommand_from api; and __fish_seen_subcommand_from GET; and not __fish_seen_subcommand_from spec routes",
    );
  });
});

describe("formatBashCompletion", () => {
  test("includes nested case blocks", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("api)");
    expect(output).toContain("api-docs)");
    expect(output).toContain("catalogs");
  });

  test("includes leaf command flags", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatBashCompletion(spec);
    expect(output).toContain("--raw-field");
    expect(output).toContain("--field");
    expect(output).toContain("--body");
  });
});

describe("collectCompletionContexts", () => {
  test("returns leaf contexts with flags and no subcommands", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const contexts = collectCompletionContexts(spec);

    // api is now a leaf (pure path invoker) — it has field/body flags directly
    const apiContext = contexts.find(
      (context) => context.segments.join("/") === "api",
    );
    expect(apiContext?.flags.some((flag) => flag.name === "field")).toBe(true);
    expect(apiContext?.flags.some((flag) => flag.name === "body")).toBe(true);
    expect(apiContext?.subcommands).toEqual([]);
  });
});

describe("formatFishCompletion", () => {
  test("includes scoped leaf flag completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatFishCompletion(spec);
    expect(output).toContain("-l field");
  });
});

describe("formatZshCompletion", () => {
  test("includes leaf flag completions", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const output = formatZshCompletion(spec);
    expect(output).toContain("--field");
    expect(output).toContain("--body");
  });
});
