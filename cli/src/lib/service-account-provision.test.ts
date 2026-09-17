import { describe, expect, test } from "bun:test";
import { ConfigurationError } from "@/lib/errors.ts";
import { parseServiceAccountScope } from "@/lib/service-account-provision.ts";

describe("parseServiceAccountScope", () => {
  test("parses a bare mode as a blanket scope", () => {
    expect(parseServiceAccountScope("ro")).toBe("ro");
    expect(parseServiceAccountScope("rw")).toBe("rw");
    expect(parseServiceAccountScope(" RO ")).toBe("ro");
  });

  test("parses multiple catalog:mode entries", () => {
    expect(parseServiceAccountScope("catalog1:ro,catalog2:rw")).toEqual({
      catalog1: "ro",
      catalog2: "rw",
    });
  });

  test("parses a single entry", () => {
    expect(parseServiceAccountScope("analytics:rw")).toEqual({ analytics: "rw" });
  });

  test("trims whitespace and lowercases the mode", () => {
    expect(parseServiceAccountScope(" catalog1 : RO , catalog2: Rw ")).toEqual({
      catalog1: "ro",
      catalog2: "rw",
    });
  });

  test("splits on the last colon so catalog names may contain colons", () => {
    expect(parseServiceAccountScope("org:analytics:ro")).toEqual({ "org:analytics": "ro" });
  });

  test("rejects a mode other than ro or rw", () => {
    expect(() => parseServiceAccountScope("catalog1:read")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountScope("catalog1:read")).toThrow("catalog1:read");
  });

  test("rejects an entry with no colon", () => {
    expect(() => parseServiceAccountScope("catalog1")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountScope("catalog1")).toThrow("catalog1");
  });

  test("rejects an empty catalog name", () => {
    expect(() => parseServiceAccountScope(":ro")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountScope(":ro")).toThrow(":ro");
  });

  test("rejects a duplicate catalog", () => {
    expect(() => parseServiceAccountScope("catalog1:ro,catalog1:rw")).toThrow(ConfigurationError);
    expect(() => parseServiceAccountScope("catalog1:ro,catalog1:rw")).toThrow("catalog1");
  });
});
