import { describe, expect, test } from "bun:test";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { ConfigurationError } from "@/lib/errors.ts";
import { parseServiceAccountCaveats } from "@/lib/service-account-provision.ts";

// Fails the moment `bun run spec:refresh` picks the operation up, which is the
// signal to drop the hand-written EnvironmentServiceAccountResponse envelope.
test("the environment service account operation is still absent from the spec", () => {
  const shipped = OPENAPI_OPERATIONS.some(
    (operation) => operation.operationId === "createEnvironmentServiceAccount",
  );
  expect(shipped).toBe(false);
});

describe("parseServiceAccountCaveats", () => {
  test("parses multiple catalog:mode entries", () => {
    expect(parseServiceAccountCaveats("catalog1:ro,catalog2:rw")).toEqual({
      catalog1: "ro",
      catalog2: "rw",
    });
  });

  test("parses a single entry", () => {
    expect(parseServiceAccountCaveats("analytics:rw")).toEqual({ analytics: "rw" });
  });

  test("trims whitespace and lowercases the mode", () => {
    expect(parseServiceAccountCaveats(" catalog1 : RO , catalog2: Rw ")).toEqual({
      catalog1: "ro",
      catalog2: "rw",
    });
  });

  test("splits on the last colon so catalog names may contain colons", () => {
    expect(parseServiceAccountCaveats("org:analytics:ro")).toEqual({ "org:analytics": "ro" });
  });

  test("rejects a mode other than ro or rw", () => {
    expect(() => parseServiceAccountCaveats("catalog1:read")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountCaveats("catalog1:read")).toThrow("catalog1:read");
  });

  test("rejects an entry with no colon", () => {
    expect(() => parseServiceAccountCaveats("catalog1")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountCaveats("catalog1")).toThrow("catalog1");
  });

  test("rejects an empty catalog name", () => {
    expect(() => parseServiceAccountCaveats(":ro")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountCaveats(":ro")).toThrow(":ro");
  });

  test("rejects a duplicate catalog", () => {
    expect(() => parseServiceAccountCaveats("catalog1:ro,catalog1:rw")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountCaveats("catalog1:ro,catalog1:rw")).toThrow("catalog1");
  });
});
