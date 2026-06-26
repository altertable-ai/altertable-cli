import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { CommandDef } from "citty";
import { runCommand } from "citty";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMainCommand } from "@/cli.ts";
import { apiCommand, apiDocsCommand, runApiRoutesCommand, runApiSpecCommand } from "@/commands/api.ts";
import { OPENAPI_OPERATIONS } from "@/generated/openapi-operations.ts";
import { setCliContext } from "@/context.ts";
import { buildCompletionSpec, flattenTopLevelNames } from "@/lib/completion-spec.ts";
import { createCliRuntime } from "@/lib/runtime.ts";

function createCaptureSink(json: boolean) {
  const stdout: string[] = [];
  const runtime = createCliRuntime({ debug: false, json });
  runtime.output.writeRaw = (body) => {
    stdout.push(body);
  };
  runtime.output.writeHuman = (text) => {
    stdout.push(text);
  };
  runtime.output.writeJson = (data) => {
    stdout.push(JSON.stringify(data));
  };
  return { sink: runtime.output, stdout };
}

async function runApiSpec(json: boolean): Promise<string> {
  const { sink, stdout } = createCaptureSink(json);
  runApiSpecCommand(sink);
  return stdout.join("");
}

async function runApiRoutes(json: boolean, operation?: string): Promise<string> {
  const { sink, stdout } = createCaptureSink(json);
  runApiRoutesCommand(sink, operation);
  return stdout.join("");
}

describe("api", () => {
  beforeEach(() => {
    setCliContext({ debug: false, json: false });
  });

  afterEach(() => {
    setCliContext({ debug: false, json: false });
  });

  test("api spec prints YAML containing Altertable Management API", async () => {
    const output = await runApiSpec(false);
    expect(output).toContain("Altertable Management API");
    expect(output).toContain("openapi: 3.1.0");
  });

  test("api spec with JSON context prints parseable JSON with openapi 3.1.0", async () => {
    setCliContext({ debug: false, json: true });
    const output = await runApiSpec(true);
    const document = JSON.parse(output) as { openapi?: string; info?: { title?: string } };
    expect(document.openapi).toBe("3.1.0");
    expect(document.info?.title).toBe("Altertable Management API");
  });

  test("OPENAPI_OPERATIONS lists createDatabase", () => {
    expect(OPENAPI_OPERATIONS.some((operation) => operation.operationId === "createDatabase")).toBe(
      true,
    );
  });

  test("api routes inspects one operation in human mode", async () => {
    const output = await runApiRoutes(false, "createDatabase");
    expect(output).toContain("Operation: createDatabase");
    expect(output).toContain("Path: /environments/{environment_id}/databases");
    expect(output).toContain("Parameters: environment_id");
  });

  test("api routes operation detail includes path parameters in JSON mode", async () => {
    const output = await runApiRoutes(true, "createServiceAccountCredential");
    const operation = JSON.parse(output) as { operationId?: string; parameters?: string[] };
    expect(operation.operationId).toBe("createServiceAccountCredential");
    expect(operation.parameters).toEqual(["service_account_id", "environment_id"]);
  });

  test("buildMainCommand top-level names include api and exclude connections", () => {
    const spec = buildCompletionSpec(buildMainCommand());
    const topLevelNames = flattenTopLevelNames(spec);
    expect(topLevelNames).toContain("api");
    expect(topLevelNames).toContain("api-docs");
    expect(topLevelNames).not.toContain("connections");
    expect(topLevelNames).not.toContain("service-accounts");
    expect(topLevelNames).not.toContain("databases");
    expect(topLevelNames).not.toContain("credentials");
  });

  test("api command is a pure invoker with no subcommands", () => {
    expect(apiCommand.subCommands).toBeUndefined();
  });

  test("api-docs exposes spec and routes subcommands", () => {
    const subCommands = apiDocsCommand.subCommands as Record<string, CommandDef>;
    expect(subCommands.spec?.run).toBeDefined();
    expect(subCommands.routes?.run).toBeDefined();
  });

  test("api POST subcommand issues a single HTTP request", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "altertable-api-command-test-"));
    const mockFile = join(testHome, "mocks.json");
    const logFile = join(testHome, "http.log");
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

    process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
    process.env.ALTERTABLE_HTTP_LOG = logFile;
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
    process.env.ALTERTABLE_API_KEY = "atm_test";

    try {
      await runCommand(buildMainCommand(), {
        rawArgs: ["api", "-X", "POST", "/service_accounts", "-f", "label=CI Bot"],
      });

      const logContent = readFileSync(logFile, "utf8");
      const payloadLines = logContent.match(/^PAYLOAD=.*$/gm) ?? [];
      expect(payloadLines).toHaveLength(1);
      expect(logContent).toContain("/rest/v1/service_accounts");
      expect(logContent).not.toContain("/rest/v1/POST");
    } finally {
      rmSync(testHome, { recursive: true, force: true });
      delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
      delete process.env.ALTERTABLE_HTTP_LOG;
      delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
      delete process.env.ALTERTABLE_API_KEY;
    }
  });

  test("api treats a literal path that looks like a keyword as a path", async () => {
    const testHome = mkdtempSync(join(tmpdir(), "altertable-api-literal-test-"));
    const mockFile = join(testHome, "mocks.json");
    const logFile = join(testHome, "http.log");
    writeFileSync(
      mockFile,
      JSON.stringify([{ urlPattern: "/spec", method: "GET", body: "{}" }]),
    );

    process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
    process.env.ALTERTABLE_HTTP_LOG = logFile;
    process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
    process.env.ALTERTABLE_API_KEY = "atm_test";

    try {
      await runCommand(buildMainCommand(), { rawArgs: ["api", "/spec"] });
      const logContent = readFileSync(logFile, "utf8");
      expect(logContent).toContain("/rest/v1/spec");
    } finally {
      rmSync(testHome, { recursive: true, force: true });
      delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
      delete process.env.ALTERTABLE_HTTP_LOG;
      delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
      delete process.env.ALTERTABLE_API_KEY;
    }
  });
});
