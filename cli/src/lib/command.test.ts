import { describe, expect, test } from "bun:test";
import {
  CommandParseError,
  defineCommand,
  defineRootCommand,
  runCommandTree,
} from "@/lib/command.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

describe("command composition", () => {
  test("defineCommand preserves the declarative command object", () => {
    const definition = { meta: { name: "leaf" } };

    expect(defineCommand(definition)).toBe(definition);
  });

  test("dispatches a declarative command with injected runtime", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    let receivedRuntime: unknown;
    let executionIsStable = false;
    const leaf = defineCommand({
      meta: { name: "leaf" },
      run(context) {
        receivedRuntime = context.runtime;
        executionIsStable = context.execution === context.execution;
      },
    });
    const definition = { meta: { name: "root" }, subCommands: { leaf } };

    const root = defineRootCommand(definition);

    expect(root).toBe(definition);
    await runWithCliRuntime(runtime, () => runCommandTree(root, { rawArgs: ["leaf"] }));
    expect(receivedRuntime).toBe(runtime);
    expect(executionIsStable).toBe(true);
  });

  test("parses global and command flags in every position", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const received: Array<Record<string, unknown>> = [];
    const leaf = defineCommand({
      meta: { name: "leaf" },
      args: {
        mode: { type: "enum", alias: "m", options: ["fast", "safe"], default: "safe" },
        tag: { type: "string", alias: "t", repeatable: true },
        value: { type: "positional", required: true },
      },
      run({ args }) {
        received.push(args);
      },
    });
    const root = defineRootCommand({
      args: {
        json: { type: "boolean", flagScope: "global" },
        profile: { type: "string", flagScope: "global" },
      },
      subCommands: { leaf },
    });

    await runWithCliRuntime(runtime, () =>
      runCommandTree(root, {
        rawArgs: [
          "--profile",
          "staging",
          "leaf",
          "payload",
          "-t",
          "one",
          "--json",
          "--tag=two",
          "-m=fast",
        ],
      }),
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

  test("resolves aliases, subcommands, and intentional direct operands", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const calls: string[] = [];
    const parent = defineCommand({
      meta: { name: "query", alias: "q" },
      soleDirectOperands: ["show"],
      args: {
        statement: { type: "positional", required: false, directRequired: true },
      },
      subCommands: {
        show: defineCommand({
          meta: { name: "show" },
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
    const root = defineRootCommand({ subCommands: { query: parent } });

    await runWithCliRuntime(runtime, async () => {
      await runCommandTree(root, { rawArgs: ["q", "show"] });
      await runCommandTree(root, { rawArgs: ["query", "show", "query-1"] });
    });

    expect(calls).toEqual(["direct:show", "subcommand:query-1"]);
  });

  test("honors the option separator and validates the invocation contract", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    let received = "";
    const root = defineRootCommand({
      args: {
        version: { type: "boolean", alias: "v", flagScope: "root-only" },
      },
      subCommands: {
        leaf: defineCommand({
          meta: { name: "leaf" },
          args: { value: { type: "positional", required: true } },
          run({ args }) {
            received = String(args.value);
          },
        }),
      },
    });

    await runWithCliRuntime(runtime, () =>
      runCommandTree(root, { rawArgs: ["leaf", "--", "--literal"] }),
    );
    expect(received).toBe("--literal");

    expect(
      runWithCliRuntime(runtime, () =>
        runCommandTree(root, { rawArgs: ["leaf", "value", "--version"] }),
      ),
    ).rejects.toBeInstanceOf(CommandParseError);
    expect(
      runWithCliRuntime(runtime, () =>
        runCommandTree(root, { rawArgs: ["leaf", "value", "extra"] }),
      ),
    ).rejects.toThrow("Unexpected argument: extra.");
  });
});
