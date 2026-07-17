import { describe, expect, test } from "bun:test";
import { defineArgs } from "@/lib/command.ts";
import { normalizeProfileConfigureRawArgs } from "@/commands/profile/index.ts";

const rootArgs = defineArgs({
  profile: { type: "string" },
});

describe("normalizeProfileConfigureRawArgs", () => {
  test.each([
    [
      ["profile", "--configure", "--profile", "production"],
      ["profile", "configure", "--profile", "production"],
    ],
    [
      ["--profile", "production", "profile", "--configure"],
      ["--profile", "production", "profile", "configure"],
    ],
    [
      ["--profile=production", "profile", "--configure"],
      ["--profile=production", "profile", "configure"],
    ],
  ])("rewrites retained compatibility syntax %#", (rawArgs, expected) => {
    expect(normalizeProfileConfigureRawArgs(rawArgs, rootArgs)).toEqual(expected);
  });

  test("leaves canonical profile commands unchanged", () => {
    expect(
      normalizeProfileConfigureRawArgs(["profile", "configure", "production"], rootArgs),
    ).toEqual(["profile", "configure", "production"]);
  });
});
