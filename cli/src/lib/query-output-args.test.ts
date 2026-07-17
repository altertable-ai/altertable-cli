import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import { parseQueryOutputOptions } from "@/lib/query-output-args.ts";

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
      { agent: false, rawArgs: [] },
    );

    expect(options).toMatchObject({
      format: "markdown",
      displayOptions: { layout: "line", columns: ["id", "name"], maxColumnWidth: 24 },
      pagerOptions: { mode: "never" },
    });
  });

  test("derives machine-readable output from agent context", () => {
    expect(parseQueryOutputOptions({}, { agent: true, rawArgs: [] })).toMatchObject({
      format: "human",
      pagerOptions: { mode: "never" },
    });
  });

  test("rejects incompatible or invalid presentation settings", () => {
    for (const run of [
      () => parseQueryOutputOptions({}, { agent: true, rawArgs: ["--layout", "table"] }),
      () =>
        parseQueryOutputOptions(
          { "max-width": "4" },
          { agent: false, rawArgs: ["--max-width", "4"] },
        ),
      () =>
        parseQueryOutputOptions(
          { pager: "sometimes" },
          { agent: false, rawArgs: ["--pager", "sometimes"] },
        ),
    ]) {
      expect(run).toThrow(CliError);
    }
  });
});
