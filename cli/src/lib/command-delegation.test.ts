import { describe, expect, test } from "bun:test";
import { defineArgs } from "@/lib/command.ts";
import {
  findFirstPositionalToken,
  isDelegatedSubCommand,
  normalizeDirectCommandRawArgs,
  normalizePassthroughCommandRawArgs,
  valueFlagsFor,
} from "@/lib/command-delegation.ts";

const rootArgs = defineArgs({
  profile: { type: "string", description: "Use a named profile" },
  json: { type: "boolean", description: "JSON output" },
});

const passthroughArgs = defineArgs({
  method: { type: "enum", alias: "X", options: ["GET", "POST"] },
  field: { type: "string", alias: "f" },
  verbose: { type: "boolean" },
});

describe("command delegation helpers", () => {
  test("valueFlagsFor extracts string and enum flags with aliases", () => {
    expect(valueFlagsFor(passthroughArgs)).toEqual(new Set(["--method", "-X", "--field", "-f"]));
  });

  test("findFirstPositionalToken skips value flag payloads", () => {
    const token = findFirstPositionalToken(["-X", "GET", "-f", "a=b", "/whoami"], {
      valueFlags: valueFlagsFor(passthroughArgs),
    });
    expect(token).toEqual({ index: 4, value: "/whoami" });
  });

  test("isDelegatedSubCommand detects reserved command operands", () => {
    const delegated = isDelegatedSubCommand(
      ["routes"],
      (value) => value === "routes" || value === "spec",
    );
    expect(delegated).toBe(true);
  });

  test("isDelegatedSubCommand ignores reserved words used as flag values", () => {
    const delegated = isDelegatedSubCommand(
      ["--profile", "show", "--field", "status", "SELECT 1"],
      (value) => value === "show" || value === "status",
      {
        valueFlags: new Set([...valueFlagsFor(rootArgs), ...valueFlagsFor(passthroughArgs)]),
      },
    );

    expect(delegated).toBe(false);
  });

  test("normalizePassthroughCommandRawArgs inserts separator before non-command operands", () => {
    const normalized = normalizePassthroughCommandRawArgs(
      ["--profile", "dev", "api", "-X", "GET", "/whoami"],
      {
        commandName: "api",
        rootArgs,
        commandValueFlags: valueFlagsFor(passthroughArgs),
        isReservedOperand: (value) => value === "routes" || value === "GET",
      },
    );

    expect(normalized).toEqual(["--profile", "dev", "api", "-X", "GET", "--", "/whoami"]);
  });

  test("normalizePassthroughCommandRawArgs leaves delegated operands unchanged", () => {
    const normalized = normalizePassthroughCommandRawArgs(["api", "routes"], {
      commandName: "api",
      commandValueFlags: valueFlagsFor(passthroughArgs),
      isReservedOperand: (value) => value === "routes",
    });

    expect(normalized).toEqual(["api", "routes"]);
  });

  test("normalizeDirectCommandRawArgs keeps flags before a direct operand", () => {
    const normalized = normalizeDirectCommandRawArgs(["query", "SELECT 1", "-X", "GET"], {
      commandName: "query",
      commandValueFlags: valueFlagsFor(passthroughArgs),
      isReservedOperand: (value) => value === "show",
    });

    expect(normalized).toEqual(["query", "-X", "GET", "--", "SELECT 1"]);
  });
});
