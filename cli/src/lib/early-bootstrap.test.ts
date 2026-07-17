import { describe, expect, test } from "bun:test";
import {
  EARLY_BOOTSTRAP_EXITS,
  HELP_FLAGS,
  VERSION_FLAGS,
  findEarlyBootstrapExit,
} from "@/lib/early-bootstrap.ts";

describe("early-bootstrap", () => {
  test("help flags match empty argv and explicit help", () => {
    expect(findEarlyBootstrapExit([])?.id).toBe("help");
    expect(findEarlyBootstrapExit(["--help"])?.id).toBe("help");
    expect(findEarlyBootstrapExit(["query", "-h"])?.id).toBe("help");
  });

  test("help flags are literal operands after the option separator", () => {
    expect(findEarlyBootstrapExit(["query", "--", "--help"])).toBeUndefined();
    expect(findEarlyBootstrapExit(["query", "--", "-h"])).toBeUndefined();
    expect(findEarlyBootstrapExit(["query", "--help", "--", "SELECT 1"])?.id).toBe("help");
  });

  test("version flags match only when argv is a single version flag", () => {
    expect(findEarlyBootstrapExit(["--version"])?.id).toBe("version");
    expect(findEarlyBootstrapExit(["-v"])?.id).toBe("version");
    expect(findEarlyBootstrapExit(["query", "--version"])).toBeUndefined();
  });

  test("declares help and version flag aliases", () => {
    expect(EARLY_BOOTSTRAP_EXITS.map((exit) => exit.id)).toEqual(["help", "version"]);
    expect(HELP_FLAGS).toEqual(["--help", "-h"]);
    expect(VERSION_FLAGS).toEqual(["--version", "-v"]);
  });
});
