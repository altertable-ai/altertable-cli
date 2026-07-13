import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_ENV_KEYS, Env, isSecretEnv, readEnvFrom, validateEnvironment } from "@/lib/env.ts";
import { ConfigurationError, EXIT_CONFIG } from "@/lib/errors.ts";

describe("environment schema", () => {
  test("maps typed keys to their canonical environment names", () => {
    expect(Env.apiKey).toBe("ALTERTABLE_API_KEY");
    expect(Env.managementApiBase).toBe("ALTERTABLE_MANAGEMENT_API_BASE");
    expect(new Set(CONFIG_ENV_KEYS).size).toBe(CONFIG_ENV_KEYS.length);
  });

  test("returns undefined for absent and empty optional values", () => {
    expect(readEnvFrom({}, "apiKey")).toBeUndefined();
    expect(readEnvFrom({ ALTERTABLE_API_KEY: "" }, "apiKey")).toBeUndefined();
  });

  test("parses booleans without truthy-string ambiguity", () => {
    expect(readEnvFrom({ ALTERTABLE_ALLOW_INSECURE_HTTP: "true" }, "allowInsecureHttp")).toBe(true);
    expect(readEnvFrom({ ALTERTABLE_ALLOW_INSECURE_HTTP: "0" }, "allowInsecureHttp")).toBe(false);
  });

  test("rejects invalid enum and boolean values as configuration errors", () => {
    for (const [source, key] of [
      [{ ALTERTABLE_UPDATE_INSTALLER: "nmp" }, "updateInstaller"],
      [{ ALTERTABLE_ALLOW_INSECURE_HTTP: "yes" }, "allowInsecureHttp"],
    ] as const) {
      try {
        readEnvFrom(source, key);
        throw new Error("expected environment validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).exitCode).toBe(EXIT_CONFIG);
        expect((error as Error).message).toContain(Env[key]);
      }
    }
  });

  test("validates the OAuth redirect port exactly", () => {
    expect(readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "0" }, "oauthRedirectPort")).toBe(0);
    expect(readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "65535" }, "oauthRedirectPort")).toBe(
      65_535,
    );
    expect(() =>
      readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "12px" }, "oauthRedirectPort"),
    ).toThrow(ConfigurationError);
    expect(() =>
      readEnvFrom({ ALTERTABLE_OAUTH_REDIRECT_PORT: "65536" }, "oauthRedirectPort"),
    ).toThrow(ConfigurationError);
  });

  test("classifies credential values for safe diagnostics", () => {
    expect(isSecretEnv("apiKey")).toBe(true);
    expect(isSecretEnv("lakehousePassword")).toBe(true);
    expect(isSecretEnv("lakehouseUsername")).toBe(false);
  });

  test("rejects misspelled Altertable variable names", () => {
    expect(() =>
      validateEnvironment({ ALTERTABLE_API_KEI: "secret", ALTERTABLE_API_KEY: "valid" }),
    ).toThrow("Unknown Altertable environment variable: ALTERTABLE_API_KEI");
  });

  test("validates every configured Altertable value at startup", () => {
    expect(() => validateEnvironment({ ALTERTABLE_UPDATE_SOURCE: "gitlab" })).toThrow(
      ConfigurationError,
    );
  });
});

test("production modules access the environment only through env.ts", async () => {
  const sourceRoot = join(import.meta.dir, "..", "src");
  const directAccessPattern = /(?:process|globalThis\.process\?)\.env/;
  const violations: string[] = [];

  for await (const relativePath of new Bun.Glob("**/*.ts").scan(sourceRoot)) {
    if (relativePath === "lib/env.ts" || relativePath.startsWith("generated/")) {
      continue;
    }
    const source = await readFile(join(sourceRoot, relativePath), "utf8");
    if (directAccessPattern.test(source)) {
      violations.push(relativePath);
    }
  }

  expect(violations).toEqual([]);
});
