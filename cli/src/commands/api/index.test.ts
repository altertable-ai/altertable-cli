import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMainCommand } from "@/cli.ts";
import { apiCommand, normalizeApiInvocatorRawArgs } from "@/commands/api/index.ts";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { setCliContext } from "@/context.ts";
import { buildCompletionSpec, flattenTopLevelNames } from "@/commands/completion/lib/spec.ts";
import { createCliRuntime, getCliRuntime, setCliRuntime } from "@/lib/runtime.ts";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import { defineArgs, runCommandTree, type Command } from "@/lib/command.ts";

describe("api", () => {
  beforeEach(() => {
    setCliContext({ debug: false, json: false, agent: false });
  });

  afterEach(() => {
    setCliContext({ debug: false, json: false, agent: false });
  });

  test("api spec prints YAML containing Altertable Management API", async () => {
    const result = await runCommandWithTestRuntime(["api", "spec", "--format", "yaml"], {
      debug: false,
      json: false,
      agent: false,
    });
    const output = result.stdout.join("");
    expect(output).toContain("Altertable Management API");
    expect(output).toContain("openapi: 3.1.0");
    expect(output).not.toContain("AUTO-GENERATED");
  });

  test("api spec with JSON context prints parseable JSON with openapi 3.1.0", async () => {
    const result = await runCommandWithTestRuntime(["api", "spec", "--format", "json"], {
      debug: false,
      json: true,
      agent: false,
    });
    const output = result.stdout.join("");
    const document = JSON.parse(output) as { openapi?: string; info?: { title?: string } };
    expect(document.openapi).toBe("3.1.0");
    expect(document.info?.title).toBe("Altertable Management API");
  });

  test("api spec subcommand runs without ENDPOINT validation errors", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    runtime.output.writeHuman = (text) => {
      stdout.push(text);
    };
    runtime.output.writeRaw = (body) => {
      stdout.push(body);
    };
    runtime.output.writeStderr = (line) => {
      stderr.push(line);
    };
    runtime.output.writeMetadata = (lines) => {
      stderr.push(...lines);
    };

    const previousRuntime = getCliRuntime();
    setCliRuntime(runtime);

    try {
      await runCommandTree(buildMainCommand(), {
        rawArgs: ["api", "spec", "--format", "yaml"],
      });
    } finally {
      setCliRuntime(previousRuntime);
    }

    const output = stdout.join("");
    const errorOutput = stderr.join("");
    expect(errorOutput).not.toContain("ENDPOINT");
    expect(output).toContain("openapi: 3.1.0");
    expect(output).not.toContain("AUTO-GENERATED");
  });

  test("OPENAPI_OPERATIONS lists createDatabase", () => {
    expect(OPENAPI_OPERATIONS.some((operation) => operation.operationId === "createDatabase")).toBe(
      true,
    );
  });

  test("api routes inspects one operation in human mode", async () => {
    const result = await runCommandWithTestRuntime(["api", "routes", "createDatabase"], {
      debug: false,
      json: false,
      agent: false,
    });
    const output = result.stdout.join("");
    expect(output).toContain("createDatabase");
    expect(output).toContain("Path:");
    expect(output).toContain("/environments/{environment_id}/databases");
    expect(output).toContain("environment_id");
  });

  test("api routes operation detail includes path parameters in JSON mode", async () => {
    const result = await runCommandWithTestRuntime(
      ["api", "routes", "createServiceAccountCredential"],
      { debug: false, json: true, agent: false },
    );
    const output = result.stdout.join("");
    const operation = JSON.parse(output) as { operationId?: string; parameters?: string[] };
    expect(operation.operationId).toBe("createServiceAccountCredential");
    expect(operation.parameters).toEqual(["service_account_id", "environment_id"]);
  });

  test("buildMainCommand top-level names include api and exclude connections", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const topLevelNames = flattenTopLevelNames(spec);
    expect(topLevelNames).toContain("api");
    expect(topLevelNames).not.toContain("connections");
    expect(topLevelNames).not.toContain("service-accounts");
    expect(topLevelNames).not.toContain("databases");
    expect(topLevelNames).not.toContain("credentials");
  });

  test("api command tree exposes spec and routes subcommands", () => {
    const subCommands = apiCommand.subCommands as Record<string, Command>;
    expect(subCommands.spec?.run).toBeDefined();
    expect(subCommands.routes?.run).toBeDefined();
  });

  test("normalizeApiInvocatorRawArgs inserts -- before endpoint paths", () => {
    const rootArgs = defineArgs({
      profile: { type: "string", description: "Use a named profile" },
    });

    expect(normalizeApiInvocatorRawArgs(["api", "/whoami"])).toEqual(["api", "--", "/whoami"]);
    expect(normalizeApiInvocatorRawArgs(["api", "GET", "/whoami"])).toEqual([
      "api",
      "GET",
      "/whoami",
    ]);
    expect(normalizeApiInvocatorRawArgs(["api", "routes"])).toEqual(["api", "routes"]);
    expect(normalizeApiInvocatorRawArgs(["--json", "api", "/whoami"])).toEqual([
      "--json",
      "api",
      "--",
      "/whoami",
    ]);
    expect(normalizeApiInvocatorRawArgs(["--profile", "dev", "api", "/whoami"], rootArgs)).toEqual([
      "--profile",
      "dev",
      "api",
      "--",
      "/whoami",
    ]);
    expect(
      normalizeApiInvocatorRawArgs(["api", "-f", "label=CI Bot", "/service_accounts"]),
    ).toEqual(["api", "-f", "label=CI Bot", "--", "/service_accounts"]);
    expect(normalizeApiInvocatorRawArgs(["api", "-X", "GET", "/service_accounts"])).toEqual([
      "api",
      "-X",
      "GET",
      "--",
      "/service_accounts",
    ]);
    expect(normalizeApiInvocatorRawArgs(["api", "--", "/whoami"])).toEqual([
      "api",
      "--",
      "/whoami",
    ]);
  });

  describe("api HTTP invoker", () => {
    let testHome = "";
    let mockFile = "";
    let logFile = "";

    beforeEach(() => {
      testHome = mkdtempSync(join(tmpdir(), "altertable-api-test-"));
      mockFile = join(testHome, "mocks.json");
      logFile = join(testHome, "http.log");
      process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
      process.env.ALTERTABLE_HTTP_LOG = logFile;
      process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
      process.env.ALTERTABLE_API_KEY = "atm_test";
    });

    afterEach(() => {
      rmSync(testHome, { recursive: true, force: true });
      delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
      delete process.env.ALTERTABLE_HTTP_LOG;
      delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
      delete process.env.ALTERTABLE_API_KEY;
    });

    test("endpoint path without method issues a single HTTP request", async () => {
      writeFileSync(
        mockFile,
        JSON.stringify([
          {
            urlPattern: "/whoami",
            method: "GET",
            body: '{"user":{"email":"dev@example.com"}}',
          },
        ]),
      );

      await runCommandWithTestRuntime(normalizeApiInvocatorRawArgs(["api", "/whoami"]));

      const logContent = readFileSync(logFile, "utf8");
      expect(logContent).toContain("/rest/v1/whoami");
      expect(logContent).toContain("METHOD=GET");
    });

    test("POST subcommand issues a single HTTP request", async () => {
      writeFileSync(
        mockFile,
        JSON.stringify([
          {
            urlPattern: "/service_accounts",
            method: "POST",
            body: '{"service_account":{"id":"sa_1","label":"CI Bot","slug":"ci-bot"}}',
          },
        ]),
      );

      await runCommandWithTestRuntime(["api", "POST", "/service_accounts", "-f", "label=CI Bot"]);

      const logContent = readFileSync(logFile, "utf8");
      const payloadLines = logContent.match(/^PAYLOAD=.*$/gm) ?? [];
      expect(payloadLines).toHaveLength(1);
      expect(logContent).toContain("/rest/v1/service_accounts");
      expect(logContent).not.toContain("/rest/v1/POST");
    });
  });
});
