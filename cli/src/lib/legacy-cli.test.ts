import { describe, expect, test } from "bun:test";
import { defineArgs } from "@/lib/command.ts";
import { assertNoRemovedSyntax } from "@/lib/legacy-cli.ts";

const rootArgs = defineArgs({
  json: { type: "boolean" },
  profile: { type: "string" },
});

describe("assertNoRemovedSyntax", () => {
  test.each([
    [["profile", "use", "prod"], "profile switch"],
    [["profile", "direnv", "prod"], "profile env"],
    [["profile", "--configure"], "profile configure"],
    [["query", "run", "SELECT 1"], "query <SQL>"],
    [["append", "run", "{}"], "append <DATA>"],
    [["catalogs", "list"], '"catalogs"'],
    [["completion", "fish"], "completion generate fish"],
    [["api", "GET", "/whoami"], "api <PATH> -X GET"],
  ])("rejects removed syntax %#", (args, replacement) => {
    expect(() => assertNoRemovedSyntax(args, rootArgs)).toThrow(replacement);
  });

  test.each([
    [["profile", "switch", "prod"]],
    [["query", "SELECT 1"]],
    [["append", "{}", "--to", "db.main.rows"]],
    [["catalogs"]],
    [["completion", "generate", "fish"]],
    [["api", "/whoami", "-X", "GET"]],
  ])("accepts canonical syntax %#", (args) => {
    expect(() => assertNoRemovedSyntax(args, rootArgs)).not.toThrow();
  });
});
