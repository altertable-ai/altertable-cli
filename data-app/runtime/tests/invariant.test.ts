import { expect, test } from "bun:test";
import { invariant } from "../src/core/invariant.ts";

test("invariant narrows valid input and explains contract failures", () => {
  const value: unknown = "Trame";
  invariant(typeof value === "string", "Expected a string.");
  expect(value.toUpperCase()).toBe("TRAME");
  expect(() => invariant(false, "Invalid result.")).toThrow("Invariant failed: Invalid result.");
});
