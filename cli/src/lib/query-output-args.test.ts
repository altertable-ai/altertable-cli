import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import { parseQueryOutputOptions, resolveQueryComputeSize } from "@/lib/query-output-args.ts";

describe("parseQueryOutputOptions", () => {
  test("composes explicit query presentation settings", () => {
    const options = parseQueryOutputOptions(
      {
        format: "markdown",
        layout: "line",
        columns: "id, name",
        "max-width": "24",
        pager: "never",
      },
      { agent: false, json: false, rawArgs: [] },
    );

    expect(options).toMatchObject({
      format: "markdown",
      displayOptions: { layout: "line", columns: ["id", "name"], maxColumnWidth: 24 },
      pagerOptions: { mode: "never" },
      computeSize: "AUTO",
    });
  });

  test("derives machine-readable output from agent context", () => {
    expect(parseQueryOutputOptions({}, { agent: true, json: true, rawArgs: [] })).toMatchObject({
      format: "human",
      pagerOptions: { mode: "never" },
      computeSize: "AUTO",
    });
  });

  test("rejects incompatible or invalid presentation settings", () => {
    for (const run of [
      () =>
        parseQueryOutputOptions({}, { agent: true, json: true, rawArgs: ["--layout", "table"] }),
      () =>
        parseQueryOutputOptions(
          { "max-width": "4" },
          { agent: false, json: false, rawArgs: ["--max-width", "4"] },
        ),
      () =>
        parseQueryOutputOptions(
          { pager: "sometimes" },
          { agent: false, json: false, rawArgs: ["--pager", "sometimes"] },
        ),
      () =>
        parseQueryOutputOptions(
          { format: "parquet" },
          { agent: false, json: true, rawArgs: ["--format", "parquet"] },
        ),
      () =>
        parseQueryOutputOptions(
          { format: "csv", layout: "table" },
          { agent: false, json: false, rawArgs: ["--format", "csv", "--layout", "table"] },
        ),
      () =>
        parseQueryOutputOptions(
          { "session-id": "session-1", "compute-size": "AUTO" },
          {
            agent: false,
            json: false,
            rawArgs: ["--session-id", "session-1", "--compute-size", "AUTO"],
          },
        ),
    ]) {
      expect(run).toThrow(CliError);
    }
  });

  test("passes through request options", () => {
    const options = parseQueryOutputOptions(
      {
        format: "jsonl",
        dialect: "snowflake",
        catalog: "analytics",
        schema: "main",
        output: "out.jsonl",
        "compute-size": "L",
      },
      { agent: false, json: false, rawArgs: ["--format", "jsonl", "--compute-size", "L"] },
    );

    expect(options).toMatchObject({
      format: "jsonl",
      dialect: "snowflake",
      catalog: "analytics",
      schema: "main",
      outputPath: "out.jsonl",
      computeSize: "L",
    });
  });
});

describe("resolveQueryComputeSize", () => {
  test("defaults to AUTO without a session", () => {
    expect(resolveQueryComputeSize({ computeSizeExplicit: false })).toBe("AUTO");
  });

  test("omits default AUTO when a session is present", () => {
    expect(
      resolveQueryComputeSize({ sessionId: "session-1", computeSizeExplicit: false }),
    ).toBeUndefined();
  });

  test("keeps explicit sizes with a session", () => {
    expect(
      resolveQueryComputeSize({
        sessionId: "session-1",
        computeSizeArg: "M",
        computeSizeExplicit: true,
      }),
    ).toBe("M");
  });
});
