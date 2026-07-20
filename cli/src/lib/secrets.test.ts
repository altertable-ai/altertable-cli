import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFakeKeychain } from "@/test-utils/keychain.ts";
import { secretExists, secretGet, secretSet } from "@/lib/secrets.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-secrets-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("secretSet", () => {
  test("stores and reads secrets from the file backend", () => {
    process.env.ALTERTABLE_SECRET_BACKEND = "file";

    secretSet("api-key", "atm_test", "default");

    expect(secretGet("api-key", "default")).toBe("atm_test");
    expect(secretExists("api-key", "default")).toBe(true);
  });

  test("argv secrets use the protected file instead of Keychain process arguments", () => {
    const keychain = createFakeKeychain();

    keychain.store.secretSet("lakehouse/password", "secret", "default", {
      fromArgv: true,
    });

    expect(keychain.calls.some((args) => args.includes("add-generic-password"))).toBe(false);
    expect(keychain.store.secretGet("lakehouse/password", "default")).toBe("secret");
  });

  test("distinguishes a Keychain failure from a missing secret", () => {
    const keychain = createFakeKeychain();
    keychain.failingReads.add("profile/default/api-key");

    expect(() => keychain.store.secretExists("api-key", "default")).toThrow(
      "Failed to inspect secret in macOS keychain",
    );
    expect(() => keychain.store.secretGet("api-key", "default")).toThrow(
      "Failed to read secret from macOS keychain",
    );
  });
});

describe("secretDelete", () => {
  test("fails closed when Keychain deletion fails", () => {
    const keychain = createFakeKeychain();
    const account = "profile/default/api-key";
    keychain.store.secretSet("api-key", "atm_test", "default");
    keychain.failingDeletes.add(account);

    expect(() => keychain.store.secretDelete("api-key", "default")).toThrow(
      "Failed to delete secret from macOS keychain",
    );
    expect(keychain.store.secretGet("api-key", "default")).toBe("atm_test");
  });

  test("accepts an already absent Keychain item", () => {
    const keychain = createFakeKeychain();

    expect(() => keychain.store.secretDelete("api-key", "default")).not.toThrow();
  });
});
