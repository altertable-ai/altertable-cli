import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import { parseGlobalFlags } from "@/lib/global-flags.ts";

describe("parseGlobalFlags", () => {
  test("does not parse subcommand --profile during early bootstrap", () => {
    const context = parseGlobalFlags([
      "query",
      "run",
      "--profile",
      "staging",
      "--statement",
      "SELECT 1",
    ]);
    expect(context.profile).toBeUndefined();
  });

  test("rejects invalid --connect-timeout values", () => {
    expect(() => parseGlobalFlags(["--connect-timeout", "foo"])).toThrow(CliError);
  });
});
