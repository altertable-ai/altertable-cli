import { describe, expect, test } from "bun:test";
import { defineCommand, defineRootCommand, runCommandTree, type Command } from "@/lib/command.ts";
import { createCliRuntime } from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";

describe("command composition", () => {
  test("defineCommand preserves the declarative command object", () => {
    const definition = { meta: { name: "leaf" } };

    expect(defineCommand(definition)).toBe(definition);
  });

  test("defineRootCommand binds the assembled tree once", async () => {
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

    expect(root).not.toBe(definition);
    const subCommands = root.subCommands as Record<string, Command> | undefined;
    expect(subCommands?.leaf).not.toBe(leaf);
    await runWithCliRuntime(runtime, () => runCommandTree(root, { rawArgs: ["leaf"] }));
    expect(receivedRuntime).toBe(runtime);
    expect(executionIsStable).toBe(true);
  });
});
