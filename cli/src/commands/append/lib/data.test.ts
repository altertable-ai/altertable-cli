import { describe, expect, test } from "bun:test";
import { parseAppendJsonContent } from "@/commands/append/lib/data.ts";
import { CliError } from "@/lib/errors.ts";

describe("parseAppendJsonContent", () => {
  test("normalizes inline JSON objects", () => {
    expect(parseAppendJsonContent('{ "id": 1 }')).toBe('{"id":1}');
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
