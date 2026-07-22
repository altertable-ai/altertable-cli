import { describe, expect, test } from "bun:test";
import { parseAppendJsonContent } from "@/commands/append/lib/data.ts";
import { CliError } from "@/lib/errors.ts";

describe("parseAppendJsonContent", () => {
  test("preserves inline JSON without rounding large integers", () => {
    const input = '{ "id": 9007199254740993 }';
    expect(parseAppendJsonContent(input)).toBe(input);
  });

  test("rejects non-JSON data", () => {
    expect(() => parseAppendJsonContent("not-json")).toThrow(CliError);
  });

  test("reports a missing input file", () => {
    expect(() => parseAppendJsonContent("@/no/such/missing.json")).toThrow(
      "File not found: /no/such/missing.json",
    );
  });
});
