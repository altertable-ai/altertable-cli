import { describe, expect, test } from "bun:test";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";

describe("assertAllowedApiBase", () => {
  test("allows HTTPS and local HTTP endpoints", () => {
    expect(() => assertAllowedApiBase("https://api.altertable.ai")).not.toThrow();
    expect(() => assertAllowedApiBase("http://localhost:15000")).not.toThrow();
    expect(() => assertAllowedApiBase("http://127.0.0.1:8080")).not.toThrow();
  });

  test("requires an explicit opt-in for non-local HTTP endpoints", () => {
    const endpoint = "http://192.168.1.5:8080";

    expect(() => assertAllowedApiBase(endpoint)).toThrow("Insecure HTTP URL");
    expect(() => assertAllowedApiBase(endpoint, { allowInsecureHttp: true })).not.toThrow();
  });
});
