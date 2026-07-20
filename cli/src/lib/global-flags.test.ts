import { describe, expect, test } from "bun:test";
import { isJsonOutput, setCliContext } from "@/context.ts";
import { parseGlobalOutputFlags } from "@/lib/global-flags.ts";
import {
  createCliRuntime,
  getOutputSink,
  refreshCliRuntimeContext,
  setCliRuntime,
} from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";
import { CliError } from "@/lib/errors.ts";
import { renderCliErrorJson } from "@/ui/error.ts";

describe("parseGlobalOutputFlags", () => {
  test("parses --agent", () => {
    const context = parseGlobalOutputFlags(["--agent", "query", "SELECT 1"]);
    expect(context.agent).toBe(true);
    expect(context.json).toBe(false);
  });

  test("parses --no-color", () => {
    const context = parseGlobalOutputFlags(["--no-color", "catalogs"]);
    expect(context.noColor).toBe(true);
  });

  test("parses --json and --agent independently", () => {
    const both = parseGlobalOutputFlags(["--json", "--agent", "context"]);
    expect(both.json).toBe(true);
    expect(both.agent).toBe(true);
  });

  test("isolates non-throwing output flags for early error rendering", () => {
    const context = parseGlobalOutputFlags([
      "query",
      "SELECT 1",
      "--connect-timeout",
      "nope",
      "--json",
    ]);

    expect(context).toEqual({
      debug: false,
      json: true,
      agent: false,
      noColor: false,
    });
  });
});

describe("agent output preset", () => {
  test("isJsonOutput is true when agent is set", () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: true });
    runWithCliRuntime(runtime, () => {
      expect(isJsonOutput()).toBe(true);
    });
  });

  test("runtime sink treats agent as JSON-capable", () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: true });
    expect(runtime.output.json).toBe(true);
  });

  test("agent mode uses JSON error envelopes", () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: true });
    runWithCliRuntime(runtime, () => {
      const envelope = renderCliErrorJson(new CliError("agent failure"));
      expect(envelope).toContain('"error"');
      expect(envelope).toContain("agent failure");
    });
  });

  test("refreshCliRuntimeContext enables sink json for --agent", () => {
    setCliRuntime(createCliRuntime({ debug: false, json: false, agent: false }));
    const context = parseGlobalOutputFlags(["--agent", "context"]);
    setCliContext(context);
    expect(isJsonOutput()).toBe(true);
    expect(getOutputSink().json).toBe(true);
    refreshCliRuntimeContext({ debug: false, json: false, agent: false });
  });
});
