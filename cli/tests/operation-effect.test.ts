import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import {
  allEffects,
  httpEffect,
  httpStreamEffect,
  progressEffect,
  runOperationEffect,
  scopedEffect,
  valueEffect,
} from "@/lib/operation-effect.ts";
import type { OperationContext } from "@/lib/operation-command.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

let testHome = "";
let mockFile = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-operation-effect-test-"));
  mockFile = join(testHome, "mocks.json");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
  process.env.ALTERTABLE_API_KEY = "atm_test";
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_API_KEY;
});

function createOperationContext(): OperationContext {
  const runtime = getCliRuntime();
  return {
    args: {},
    rawArgs: [],
    runtime,
    sink: runtime.output,
    execution: createExecutionContext(runtime),
  };
}

describe("operation effects", () => {
  test("returns value effects without transport", async () => {
    const result = await runOperationEffect(valueEffect("done"), createOperationContext());
    expect(result).toBe("done");
  });

  test("runs HTTP effects through operation transport", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([{ urlPattern: "/whoami", method: "GET", body: '{"ok":true}' }]),
    );

    const result = await runOperationEffect(
      httpEffect(
        {
          plane: "management",
          method: "GET",
          endpoint: "/whoami",
        },
        (body) => JSON.parse(body) as { ok: boolean },
      ),
      createOperationContext(),
    );

    expect(result).toEqual({ ok: true });
  });

  test("runs stream effects and decodes the stream", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([{ urlPattern: "/events", method: "GET", chunked: true, body: "a\nb\n" }]),
    );

    const result = await runOperationEffect(
      httpStreamEffect(
        {
          plane: "management",
          method: "GET",
          endpoint: "/events",
        },
        async (stream) => {
          const text = await new Response(stream).text();
          return text.trim().split("\n");
        },
      ),
      createOperationContext(),
    );

    expect(result).toEqual(["a", "b"]);
  });

  test("combines parallel effects", async () => {
    const result = await runOperationEffect(
      allEffects([valueEffect(1), valueEffect(2)], (values) =>
        values.reduce<number>((sum, value) => sum + Number(value), 0),
      ),
      createOperationContext(),
    );

    expect(result).toBe(3);
  });

  test("wraps nested effects with progress", async () => {
    const result = await runOperationEffect(
      progressEffect("Working", valueEffect("ok")),
      createOperationContext(),
    );
    expect(result).toBe("ok");
  });

  test("releases scoped effects after success and failure", async () => {
    const releases: string[] = [];
    const result = await runOperationEffect(
      scopedEffect(() => ({
        effect: valueEffect("ok"),
        release: () => {
          releases.push("success");
        },
      })),
      createOperationContext(),
    );
    expect(result).toBe("ok");

    writeFileSync(mockFile, "[]", "utf8");
    try {
      await runOperationEffect(
        scopedEffect(() => ({
          effect: httpEffect({
            plane: "management",
            method: "GET",
            endpoint: "/missing",
          }),
          release: () => {
            releases.push("failure");
          },
        })),
        createOperationContext(),
      );
      throw new Error("expected scoped effect failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("No mock HTTP response");
    }

    expect(releases).toEqual(["success", "failure"]);
  });
});
