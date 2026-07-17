import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSecretEnvMetadata,
  CONFIG_ENV_NAMES,
  isSecretEnv,
  readEnvFrom,
  validateEnvironment,
} from "@/lib/env.ts";
import { ConfigurationError, EXIT_CONFIG } from "@/lib/errors.ts";

describe("environment schema", () => {
  test("uses canonical environment names as typed keys", () => {
    expect(CONFIG_ENV_NAMES).toContain("ALTERTABLE_API_KEY");
    expect(CONFIG_ENV_NAMES).toContain("ALTERTABLE_MANAGEMENT_API_BASE");
    expect(new Set(CONFIG_ENV_NAMES).size).toBe(CONFIG_ENV_NAMES.length);
  });

  test("returns undefined for absent and empty optional values", () => {
    expect(readEnvFrom({}, "ALTERTABLE_API_KEY")).toBeUndefined();
    expect(readEnvFrom({ ALTERTABLE_API_KEY: "" }, "ALTERTABLE_API_KEY")).toBeUndefined();
  });

  test("parses booleans without truthy-string ambiguity", () => {
    expect(
      readEnvFrom({ ALTERTABLE_ALLOW_INSECURE_HTTP: "true" }, "ALTERTABLE_ALLOW_INSECURE_HTTP"),
    ).toBe(true);
    expect(
      readEnvFrom({ ALTERTABLE_ALLOW_INSECURE_HTTP: "0" }, "ALTERTABLE_ALLOW_INSECURE_HTTP"),
    ).toBe(false);
  });

  test("rejects invalid enum and boolean values as configuration errors", () => {
    for (const [source, key] of [
      [{ ALTERTABLE_UPDATE_INSTALLER: "nmp" }, "ALTERTABLE_UPDATE_INSTALLER"],
      [{ ALTERTABLE_ALLOW_INSECURE_HTTP: "yes" }, "ALTERTABLE_ALLOW_INSECURE_HTTP"],
    ] as const) {
      try {
        readEnvFrom(source, key);
        throw new Error("expected environment validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).exitCode).toBe(EXIT_CONFIG);
        expect((error as Error).message).toContain(key);
      }
    }
  });

  test("validates the OAuth redirect port exactly", () => {
    expect(
      readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "0" }, "ALTERTABLE_OAUTH_REDIRECT_PORT"),
    ).toBe(0);
    expect(
      readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "65535" }, "ALTERTABLE_OAUTH_REDIRECT_PORT"),
    ).toBe(65_535);
    expect(() =>
      readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "12px" }, "ALTERTABLE_OAUTH_REDIRECT_PORT"),
    ).toThrow(ConfigurationError);
    expect(() =>
      readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "65536" }, "ALTERTABLE_OAUTH_REDIRECT_PORT"),
    ).toThrow(ConfigurationError);
  });

  test("classifies credential values for safe diagnostics", () => {
    expect(isSecretEnv("ALTERTABLE_API_KEY")).toBe(true);
    expect(isSecretEnv("ALTERTABLE_LAKEHOUSE_PASSWORD")).toBe(true);
    expect(isSecretEnv("ALTERTABLE_LAKEHOUSE_USERNAME")).toBe(false);
  });

  test("rejects credential-looking names without secret metadata", () => {
    expect(() =>
      assertSecretEnvMetadata({
        ALTERTABLE_NEW_TOKEN: { secret: false },
        ALTERTABLE_SAFE_VALUE: {},
      }),
    ).toThrow("Secret environment variables must declare secret: true: ALTERTABLE_NEW_TOKEN");
  });

  test("ignores unknown Altertable variable names", () => {
    expect(() =>
      validateEnvironment({
        ALTERTABLE_CATALOG: "analytics",
        ALTERTABLE_SCHEMA: "reporting",
        ALTERTABLE_TABLE: "events",
      }),
    ).not.toThrow();
  });

  test("validates every configured Altertable value at startup", () => {
    expect(() => validateEnvironment({ ALTERTABLE_UPDATE_SOURCE: "gitlab" })).toThrow(
      ConfigurationError,
    );
  });
});

test("production modules access the environment only through env.ts", async () => {
  const sourceRoot = join(import.meta.dir, "..");
  const directAccessPattern = /(?:process|globalThis\.process\?)\.env/;
  const violations: string[] = [];

  for await (const relativePath of new Bun.Glob("**/*.ts").scan(sourceRoot)) {
    if (
      relativePath === "lib/env.ts" ||
      relativePath.endsWith(".test.ts") ||
      relativePath.startsWith("generated/") ||
      relativePath.startsWith("test-utils/")
    ) {
      continue;
    }
    const source = await readFile(join(sourceRoot, relativePath), "utf8");
    if (directAccessPattern.test(source)) {
      violations.push(relativePath);
    }
  }

  expect(violations).toEqual([]);
});
