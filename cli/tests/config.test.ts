import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  configDir,
  configGet,
  configSet,
  configUnset,
  getQueryDefaultMaxColumnWidth,
  getQueryDefaultLayout,
  getQueryDefaultPager,
  kvGet,
  kvSet,
  resolveApiBase,
  resolveManagementApiBase,
} from "@/lib/config.ts";
import {
  secretGet,
  secretSet,
  secretExists,
  resetSecretWarningsForTests,
  setSpawnSyncForTests,
} from "@/lib/secrets.ts";
import { CliError } from "@/lib/errors.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import {
  configureRunClear,
  configureRunSet,
} from "@/lib/profile-configure-core.ts";
import { setCliContext } from "@/context.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

let testHome = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-cli-test-"));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  resetSecretWarningsForTests();
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
  delete process.env.ALTERTABLE_API_BASE;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_ENV;
  delete process.env.ALTERTABLE_API_KEY;
});

describe("config", () => {
  test("kv round-trip", () => {
    const filePath = join(testHome, "sample");
    kvSet(filePath, "user", "alice");
    expect(kvGet(filePath, "user")).toBe("alice");
    kvSet(filePath, "user", "bob");
    expect(kvGet(filePath, "user")).toBe("bob");
    configUnset("missing");
    expect(configGet("missing")).toBe("");
  });

  test("kvSet writes temp files with mode 0600", () => {
    const filePath = join(testHome, "mode-check");
    kvSet(filePath, "secret", "value");
    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("resolve api bases with defaults", () => {
    expect(resolveApiBase()).toBe("https://api.altertable.ai");
    expect(resolveManagementApiBase()).toBe("https://app.altertable.ai/rest/v1");
    configSet("api_base", "http://localhost:1111/");
    configSet("management_api_base", "http://localhost:13000/");
    expect(resolveApiBase()).toBe("http://localhost:1111");
    expect(resolveManagementApiBase()).toBe("http://localhost:13000/rest/v1");
  });

  test("env vars beat stored config", () => {
    configSet("api_base", "http://localhost:1111");
    process.env.ALTERTABLE_API_BASE = "http://localhost:2222";
    expect(resolveApiBase()).toBe("http://localhost:2222");
  });

  test("resolveApiBase rejects insecure env override without allow flag", () => {
    process.env.ALTERTABLE_API_BASE = "http://192.168.1.5";
    expect(() => resolveApiBase()).toThrow(CliError);
    delete process.env.ALTERTABLE_API_BASE;
  });

  test("resolveApiBase allows insecure env override with ALTERTABLE_ALLOW_INSECURE_HTTP", () => {
    process.env.ALTERTABLE_API_BASE = "http://192.168.1.5";
    process.env.ALTERTABLE_ALLOW_INSECURE_HTTP = "true";
    expect(resolveApiBase()).toBe("http://192.168.1.5");
    delete process.env.ALTERTABLE_API_BASE;
    delete process.env.ALTERTABLE_ALLOW_INSECURE_HTTP;
  });

  test("reads query display defaults from config", () => {
    configSet("query_max_width", "48");
    configSet("query_layout", "line");
    expect(getQueryDefaultMaxColumnWidth()).toBe(48);
    expect(getQueryDefaultLayout()).toBe("line");
  });

  test("ignores invalid query config values", () => {
    configSet("query_max_width", "4");
    configSet("query_layout", "invalid");
    expect(getQueryDefaultMaxColumnWidth()).toBeUndefined();
    expect(getQueryDefaultLayout()).toBeUndefined();
  });

  test("reads query_pager config", () => {
    configSet("query_pager", "always");
    expect(getQueryDefaultPager()).toBe("always");
  });

  test("ignores unknown query_pager values", () => {
    configSet("query_pager", "sometimes");
    expect(getQueryDefaultPager()).toBeUndefined();
  });

  test("query_pager respects ALTERTABLE_CONFIG_HOME", () => {
    configSet("query_pager", "never");
    expect(getQueryDefaultPager()).toBe("never");
  });
});

describe("secrets", () => {
  test("stores and reads file-backed secrets", () => {
    secretSet("api-key", "atm_test");
    expect(secretGet("api-key")).toBe("atm_test");
    expect(secretExists("api-key")).toBe(true);
  });
});

describe("profile --configure credential accumulation", () => {
  test("preserves management credentials when updating lakehouse credentials", async () => {
    await configureRunSet({ apiKey: "atm_test", env: "development" });
    await configureRunSet({ user: "alice", password: "lakehouse-secret" });

    expect(secretGet("api-key")).toBe("atm_test");
    expect(configGet("api_key_env")).toBe("development");
    expect(secretGet("lakehouse/password")).toBe("lakehouse-secret");
    expect(configGet("user")).toBe("alice");
  });

  test("accumulates both planes across separate configure invocations", async () => {
    await configureRunSet({
      user: "alice",
      password: "lakehouse-secret",
    });
    await configureRunSet({
      apiKey: "atm_test",
      env: "development",
    });

    expect(secretGet("api-key")).toBe("atm_test");
    expect(configGet("api_key_env")).toBe("development");
    expect(secretGet("lakehouse/password")).toBe("lakehouse-secret");
    expect(configGet("user")).toBe("alice");
  });
});

describe("profile --configure validation", () => {
  test("rejects mixing lakehouse and management credentials in one invocation", async () => {
    return expect(
      configureRunSet({ user: "u", password: "p", apiKey: "atm_x", env: "prod" }),
    ).rejects.toThrow(CliError);
  });

  test("rejects mixing lakehouse and management credentials with expected message", async () => {
    return expect(
      configureRunSet({ user: "u", password: "p", apiKey: "atm_x", env: "prod" }),
    ).rejects.toThrow(/single authentication mechanism per configure invocation/);
  });

  test("rejects two lakehouse authentication mechanisms in one invocation", async () => {
    return expect(
      configureRunSet({ user: "u", password: "p", basicToken: "dG9rZW4=" }),
    ).rejects.toThrow(CliError);
  });

  test("rejects two lakehouse authentication mechanisms with expected message", async () => {
    return expect(
      configureRunSet({ user: "u", password: "p", basicToken: "dG9rZW4=" }),
    ).rejects.toThrow(/single lakehouse authentication mechanism/);
  });
});

describe("configureRunClear", () => {
  test("configureRunClear removes root config and credentials files", async () => {
    await configureRunSet({ user: "alice", password: "lakehouse-secret" });
    configureRunClear();
    expect(existsSync(join(testHome, "config"))).toBe(false);
    expect(existsSync(join(testHome, "credentials"))).toBe(false);
    expect(existsSync(join(testHome, "profiles"))).toBe(false);
  });

  test("configureRunClear removes secrets for all profiles", async () => {
    await configureRunSet({ profile: "staging", apiKey: "atm_staging", env: "staging" });
    await configureRunSet({ profile: "prod", apiKey: "atm_prod", env: "prod" });
    secretSet("lakehouse/password", "lake-secret", "staging");
    secretSet("lakehouse/password", "lake-prod", "prod");

    configureRunClear();
    setCliContext({ debug: false, json: false, agent: false });

    expect(secretGet("api-key", "staging")).toBe("");
    expect(secretGet("api-key", "prod")).toBe("");
    expect(secretGet("lakehouse/password", "staging")).toBe("");
    expect(secretGet("lakehouse/password", "prod")).toBe("");
  });
});

describe("config dir", () => {
  test("uses ALTERTABLE_CONFIG_HOME", () => {
    expect(configDir()).toBe(testHome);
    configSet("user", "x");
    expect(existsSync(join(testHome, "profiles", "default", "config"))).toBe(true);
    expect(readFileSync(join(testHome, "profiles", "default", "config"), "utf8")).toContain(
      "user=x",
    );
  });
});

describe("url policy", () => {
  test("allows localhost HTTP without flag", () => {
    expect(() => assertAllowedApiBase("http://localhost:15000")).not.toThrow();
    expect(() => assertAllowedApiBase("http://127.0.0.1:8080")).not.toThrow();
  });

  test("allows HTTPS for any host", () => {
    expect(() => assertAllowedApiBase("https://api.altertable.ai")).not.toThrow();
  });

  test("rejects non-localhost HTTP without flag", () => {
    expect(() => assertAllowedApiBase("http://192.168.1.5:8080")).toThrow(CliError);
  });

  test("allows non-localhost HTTP with allowInsecureHttp", () => {
    expect(() =>
      assertAllowedApiBase("http://192.168.1.5:8080", { allowInsecureHttp: true }),
    ).not.toThrow();
  });
});

describe("profile --configure argv secrets", () => {
  test("warns when password is passed on argv", async () => {
    const stderr: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeMetadata = (lines) => {
      stderr.push(...lines);
    };

    await runWithCliRuntime(runtime, async () => {
      await configureRunSet({ user: "alice", password: "test-password-value" });
    });

    expect(stderr.some((line) => line.includes("--password-stdin"))).toBe(true);
  });

  test("argv secrets skip keychain write spawn", () => {
    const spawnCalls: string[][] = [];
    setSpawnSyncForTests((_command, args) => {
      spawnCalls.push([...args]);
      return {
        status: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        pid: 0,
        signal: null,
        output: [null, Buffer.from(""), Buffer.from("")],
      };
    });

    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "darwin" });

    try {
      process.env.ALTERTABLE_SECRET_BACKEND = "keychain";
      secretSet("lakehouse/password", "test-password-value", undefined, { fromArgv: true });
      const keychainWrites = spawnCalls.filter((args) => args.includes("add-generic-password"));
      expect(keychainWrites).toHaveLength(0);
      expect(secretGet("lakehouse/password")).toBe("test-password-value");
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor);
      }
      process.env.ALTERTABLE_SECRET_BACKEND = "file";
      setSpawnSyncForTests(undefined);
    }
  });
});
