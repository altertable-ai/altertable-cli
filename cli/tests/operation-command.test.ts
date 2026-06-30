import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { defineOutputCommand } from "@/lib/operation-command-builders.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-operation-command-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
});

describe("operation commands", () => {
  test("output commands render without resolving execution context", async () => {
    const runtime = getCliRuntime();
    const output: string[] = [];
    runtime.output.writeHuman = (text) => {
      output.push(text);
    };

    const command = defineOutputCommand({
      id: "test.output",
      output: "human",
      meta: { name: "test-output" },
      render() {
        return { kind: "human", text: "rendered" };
      },
    });

    await command.run?.({ args: {}, rawArgs: ["test-output"] } as never);

    expect(output).toEqual(["rendered"]);
    expect(existsSync(join(testHome, "config"))).toBe(false);
    expect(existsSync(join(testHome, "profiles"))).toBe(false);
  });
});
