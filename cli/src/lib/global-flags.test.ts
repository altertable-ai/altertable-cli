import { describe, expect, test } from "bun:test";
import { isJsonOutput, setCliContext } from "@/context.ts";
import { parseGlobalFlags } from "@/lib/global-flags.ts";
import {
  createCliRuntime,
  getOutputSink,
  refreshCliRuntimeContext,
  setCliRuntime,
} from "@/lib/runtime.ts";
import { runWithCliRuntime } from "@/test-utils/runtime.ts";
import { CliError } from "@/lib/errors.ts";
import { renderCliErrorJson } from "@/ui/error.ts";

describe("parseGlobalFlags", () => {
  test("parses --agent", () => {
    const context = parseGlobalFlags(["--agent", "query", "SELECT 1"]);
    expect(context.agent).toBe(true);
    expect(context.json).toBe(false);
  });

  test("parses --profile from argv", () => {
    const context = parseGlobalFlags(["--profile", "staging", "--help"]);
    expect(context.profile).toBe("staging");
  });

  test("parses --profile after commands", () => {
    const context = parseGlobalFlags(["profile", "--profile", "production", "show"]);
    expect(context.profile).toBe("production");
  });

  test("parses global --profile before a subcommand", () => {
    const context = parseGlobalFlags(["--profile", "staging", "catalogs"]);
    expect(context.profile).toBe("staging");
  });

  test("parses --no-color", () => {
    const context = parseGlobalFlags(["--no-color", "catalogs"]);
    expect(context.noColor).toBe(true);
  });

  test("parses --json and --agent independently", () => {
    const both = parseGlobalFlags(["--json", "--agent", "context"]);
    expect(both.json).toBe(true);
    expect(both.agent).toBe(true);
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
    const context = parseGlobalFlags(["--agent", "context"]);
    setCliContext(context);
    expect(isJsonOutput()).toBe(true);
    expect(getOutputSink().json).toBe(true);
    refreshCliRuntimeContext({ debug: false, json: false, agent: false });
  });
});
