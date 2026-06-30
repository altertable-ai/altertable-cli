import { describe, expect, test } from "bun:test";
import { buildMainCommand } from "@/cli.ts";
import { normalizeDefaultSubcommandRawArgs } from "@/lib/default-subcommands.ts";

function normalize(rawArgs: string[]): string[] {
  return normalizeDefaultSubcommandRawArgs(rawArgs, buildMainCommand());
}

describe("normalizeDefaultSubcommandRawArgs", () => {
  test("inserts the default query leaf before command flags", () => {
    expect(normalize(["query", "--statement", "SELECT 1", "--format", "json"])).toEqual([
      "query",
      "run",
      "--statement",
      "SELECT 1",
      "--format",
      "json",
    ]);
  });

  test("keeps global debug before a default command", () => {
    expect(normalize(["--debug", "query", "--statement", "SELECT 1"])).toEqual([
      "--debug",
      "query",
      "run",
      "--statement",
      "SELECT 1",
    ]);
  });

  test("keeps global debug after a default command", () => {
    expect(normalize(["query", "--debug", "--statement", "SELECT 1"])).toEqual([
      "query",
      "run",
      "--debug",
      "--statement",
      "SELECT 1",
    ]);
  });

  test("leaves explicit subcommands unchanged", () => {
    expect(normalize(["query", "show", "query-id"])).toEqual(["query", "show", "query-id"]);
  });

  test("does not redirect group help to the default leaf", () => {
    expect(normalize(["query", "--help"])).toEqual(["query", "--help"]);
  });
});
