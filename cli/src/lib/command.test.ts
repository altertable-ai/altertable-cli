import { describe, expect, test } from "bun:test";
import { defineCommand } from "@/lib/command.ts";
import { CommandParseError, executeCommand } from "@/lib/command-parser.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

describe("command composition", () => {
  test("defineCommand preserves the declarative command object", () => {
    const definition = { metadata: { name: "leaf" } };

    expect(defineCommand(definition)).toBe(definition);
  });

  test("dispatches a declarative command with injected runtime", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    let receivedRuntime: unknown;
    let executionIsStable = false;
    const leaf = defineCommand({
      metadata: { name: "leaf" },
      run(context) {
        receivedRuntime = context.runtime;
        executionIsStable = context.execution === context.execution;
      },
    });
    const definition = { metadata: { name: "root" }, subcommands: { leaf } };

    const root = defineCommand(definition);

    expect(root).toBe(definition);
    await runWithCliRuntime(runtime, () => executeCommand(root, ["leaf"]));
    expect(receivedRuntime).toBe(runtime);
    expect(executionIsStable).toBe(true);
  });

  test("parses global and command flags in every position", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const received: Array<Record<string, unknown>> = [];
    const leaf = defineCommand({
      metadata: { name: "leaf" },
      args: {
        mode: { type: "enum", alias: "m", options: ["fast", "safe"], default: "safe" },
        tag: { type: "string", alias: "t", repeatable: true },
        value: { type: "positional", required: true },
      },
      run({ args }) {
        received.push(args);
      },
    });
    const root = defineCommand({
      args: {
        json: { type: "boolean", flagScope: "global" },
        profile: { type: "string", flagScope: "global" },
      },
      subcommands: { leaf },
    });

    await runWithCliRuntime(runtime, () =>
      executeCommand(root, [
        "--profile",
        "staging",
        "leaf",
        "payload",
        "-t",
        "one",
        "--json",
        "--tag=two",
        "-m=fast",
      ]),
    );

    expect(received).toEqual([
      expect.objectContaining({
        profile: "staging",
        json: true,
        mode: "fast",
        tag: ["one", "two"],
        value: "payload",
      }),
    ]);
  });

  test("does not consume recognized flags as option values", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const leaf = defineCommand({
      metadata: { name: "leaf" },
      args: {
        columns: { type: "string", alias: "c" },
        force: { type: "boolean" },
        value: { type: "positional", required: true },
      },
    });
    const root = defineCommand({
      args: {
        json: { type: "boolean", flagScope: "global" },
        profile: { type: "string", flagScope: "global" },
      },
      subcommands: { leaf },
    });

    for (const rawArgs of [
      ["leaf", "value", "--columns", "--json"],
      ["leaf", "value", "-c", "--json"],
      ["leaf", "--profile", "--force", "value"],
    ]) {
      expect(runWithCliRuntime(runtime, () => executeCommand(root, rawArgs))).rejects.toThrow(
        /^Missing value for/,
      );
    }
  });

  test("accepts an option-like value when it is explicit", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    let received = "";
    const root = defineCommand({
      args: { json: { type: "boolean", flagScope: "global" } },
      subcommands: {
        leaf: defineCommand({
          args: {
            columns: { type: "string" },
            value: { type: "positional", required: true },
          },
          run({ args }) {
            received = String(args.columns);
          },
        }),
      },
    });

    await runWithCliRuntime(runtime, () =>
      executeCommand(root, ["leaf", "value", "--columns=--json"]),
    );

    expect(received).toBe("--json");
  });

  test("resolves aliases, subcommands, and intentional direct operands", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const calls: string[] = [];
    const parent = defineCommand({
      metadata: { name: "query", alias: "q" },
      soleDirectOperands: ["show"],
      args: {
        statement: { type: "positional", required: false, directRequired: true },
      },
      subcommands: {
        show: defineCommand({
          metadata: { name: "show" },
          args: { id: { type: "positional", required: true } },
          run({ args }) {
            calls.push(`subcommand:${String(args.id)}`);
          },
        }),
      },
      run({ args }) {
        calls.push(`direct:${String(args.statement)}`);
      },
    });
    const root = defineCommand({ subcommands: { query: parent } });

    await runWithCliRuntime(runtime, async () => {
      await executeCommand(root, ["q", "show"]);
      await executeCommand(root, ["query", "show", "query-1"]);
    });

    expect(calls).toEqual(["direct:show", "subcommand:query-1"]);
  });

  test("honors the option separator and validates the invocation contract", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    let received = "";
    const root = defineCommand({
      args: {
        version: { type: "boolean", alias: "v", flagScope: "root-only" },
      },
      subcommands: {
        leaf: defineCommand({
          metadata: { name: "leaf" },
          args: { value: { type: "positional", required: true } },
          run({ args }) {
            received = String(args.value);
          },
        }),
      },
    });

    await runWithCliRuntime(runtime, () => executeCommand(root, ["leaf", "--", "--literal"]));
    expect(received).toBe("--literal");

    expect(runWithCliRuntime(runtime, () => executeCommand(root, ["--", "leaf"]))).rejects.toThrow(
      "Unknown command leaf.",
    );
    expect(
      runWithCliRuntime(runtime, () => executeCommand(root, ["leaf", "value", "--version"])),
    ).rejects.toBeInstanceOf(CommandParseError);
    expect(
      runWithCliRuntime(runtime, () => executeCommand(root, ["leaf", "value", "extra"])),
    ).rejects.toThrow("Unexpected argument: extra.");
  });
});
