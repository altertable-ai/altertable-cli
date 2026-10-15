import { describe, expect, test } from "bun:test";
import { isJsonOutput, setCliContext } from "@/context.ts";
import {
  AGENT_ENV_VARIABLES,
  mergeGlobalFlagsFromArgs,
  parseGlobalOutputFlags,
} from "@/lib/global-flags.ts";
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
    const context = parseGlobalOutputFlags(["--no-color", "catalog"]);
    expect(context.noColor).toBe(true);
  });

  test("parses --json and --agent independently", () => {
    const both = parseGlobalOutputFlags(["--json", "--agent", "context"]);
    expect(both.json).toBe(true);
    expect(both.agent).toBe(true);
  });

  test("isolates non-throwing output flags for early error rendering", () => {
    const context = parseGlobalOutputFlags(
      ["query", "SELECT 1", "--connect-timeout", "nope", "--json"],
      { env: {}, stdoutIsTTY: false },
    );

    expect(context).toEqual({
      debug: false,
      json: true,
      agent: false,
      noColor: false,
    });
  });
});

describe("mergeGlobalFlagsFromArgs", () => {
  test("carries --ignore-ssl-errors into the context", () => {
    const merged = mergeGlobalFlagsFromArgs(
      { debug: false, json: false, agent: false },
      { "ignore-ssl-errors": true },
    );
    expect(merged.ignoreSslErrors).toBe(true);
  });

  test("leaves TLS verification untouched when the flag is absent", () => {
    const merged = mergeGlobalFlagsFromArgs({ debug: false, json: false, agent: false }, {});
    expect(merged.ignoreSslErrors).toBeUndefined();
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

describe("automatic agent mode", () => {
  for (const marker of AGENT_ENV_VARIABLES) {
    test(`detects ${marker} only outside a terminal`, () => {
      const env = { [marker]: "1" };
      expect(parseGlobalOutputFlags([], { env, stdoutIsTTY: false }).agent).toBe(true);
      expect(parseGlobalOutputFlags([], { env, stdoutIsTTY: true }).agent).toBe(false);
    });
  }
  test("leaves ordinary pipes and empty markers alone", () => {
    expect(parseGlobalOutputFlags([], { env: {}, stdoutIsTTY: false }).agent).toBe(false);
    expect(parseGlobalOutputFlags([], { env: { AI_AGENT: "" }, stdoutIsTTY: false }).agent).toBe(
      false,
    );
  });
  test("preserves explicit output formats", () => {
    for (const flags of [["--json"], ["--format", "csv"], ["--format=markdown"]]) {
      expect(
        parseGlobalOutputFlags(flags, { env: { AI_AGENT: "1" }, stdoutIsTTY: false }).agent,
      ).toBe(false);
    }
  });
  test("applies flags before environment overrides and detection", () => {
    for (const value of ["1", "true", "0", "false"]) {
      const environment = {
        env: { AI_AGENT: "1", ALTERTABLE_AGENT_MODE: value },
        stdoutIsTTY: true,
      };
      expect(parseGlobalOutputFlags([], environment).agent).toBe(value === "1" || value === "true");
      expect(parseGlobalOutputFlags(["--agent"], environment).agent).toBe(true);
      expect(parseGlobalOutputFlags(["--agent", "--no-agent"], environment).agent).toBe(false);
    }
  });
  test("ignores flags after the option separator", () => {
    expect(
      parseGlobalOutputFlags(["--", "--no-agent"], { env: { AI_AGENT: "1" }, stdoutIsTTY: false })
        .agent,
    ).toBe(true);
  });
  test("preserves detection when merging parsed flags", () => {
    expect(mergeGlobalFlagsFromArgs({ debug: false, json: false, agent: true }, {}).agent).toBe(
      true,
    );
    expect(
      mergeGlobalFlagsFromArgs(
        { debug: false, json: false, agent: true },
        { agent: true, "no-agent": true },
      ).agent,
    ).toBe(false);
  });
});
