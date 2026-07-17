import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { readJsonInput, resolveApiRequestPayload } from "@/commands/api/lib/body.ts";
import {
  apiHttpResultOutput,
  executeApiHttp,
  normalizeApiEndpoint,
  resolveApiHttp,
  type ApiHttpArgs,
} from "@/commands/api/lib/http.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { createExecutionContext } from "@/lib/execution-context.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";
import { ParseError } from "@/lib/errors.ts";

let testHome = "";
let mockFile = "";
let logFile = "";
let stdout = "";

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-api-http-test-"));
  mockFile = join(testHome, "mocks.json");
  logFile = join(testHome, "http.log");
  stdout = "";
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  process.env.ALTERTABLE_MANAGEMENT_API_BASE = "https://app.example.com";
  process.env.ALTERTABLE_API_KEY = "atm_test";
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);

  const runtime = getCliRuntime();
  runtime.output.writeRaw = (body) => {
    stdout += body;
  };
  runtime.output.writeHuman = (text) => {
    stdout += text;
  };
  runtime.output.writeJson = (data) => {
    stdout += JSON.stringify(data);
  };
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
  delete process.env.ALTERTABLE_HTTP_LOG;
  delete process.env.ALTERTABLE_MANAGEMENT_API_BASE;
  delete process.env.ALTERTABLE_API_KEY;
});

async function runApiOperation(args: ApiHttpArgs): Promise<void> {
  const runtime = getCliRuntime();
  const result = await executeApiHttp(resolveApiHttp(args), createExecutionContext(runtime));
  const output = apiHttpResultOutput(result, runtime.output);
  if (output) {
    await writeCommandOutput(output, runtime.output);
  }
}

describe("api-body", () => {
  test("builds a JSON body from request fields", () => {
    const payload = resolveApiRequestPayload({
      method: "POST",
      rawFields: ["label=CI Bot", "name=Analytics"],
    });
    expect(JSON.parse(payload.body ?? "")).toEqual({ label: "CI Bot", name: "Analytics" });
  });

  test("keeps an explicit JSON request body from --input", () => {
    const filePath = join(testHome, "payload.json");
    writeFileSync(filePath, '{"label":"raw"}', "utf8");
    const payload = resolveApiRequestPayload({
      method: "POST",
      input: filePath,
    });
    expect(payload).toEqual({ body: '{"label":"raw"}', queryFields: [] });
  });

  test("keeps fields in the query when an explicit POST body is provided", () => {
    const filePath = join(testHome, "payload-with-fields.json");
    writeFileSync(filePath, '{"label":"raw"}', "utf8");
    const payload = resolveApiRequestPayload({
      method: "POST",
      input: filePath,
      rawFields: ["label=flags"],
    });

    expect(payload).toEqual({
      body: '{"label":"raw"}',
      queryFields: [{ key: "label", value: "flags" }],
    });
  });

  test("keeps GET fields out of the request body", () => {
    const payload = resolveApiRequestPayload({
      method: "GET",
      rawFields: ["label=query"],
    });

    expect(payload).toEqual({ queryFields: [{ key: "label", value: "query" }] });
  });

  test("rejects explicit body input for methods without request bodies", () => {
    const filePath = join(testHome, "get-payload.json");
    writeFileSync(filePath, '{"label":"bad"}', "utf8");
    expect(() =>
      resolveApiRequestPayload({
        method: "GET",
        input: filePath,
      }),
    ).toThrow("GET requests do not accept a body");
  });

  test("readJsonInput reads file payloads", () => {
    const filePath = join(testHome, "payload.json");
    writeFileSync(filePath, '{"name":"from-file"}', "utf8");
    expect(readJsonInput(filePath)).toBe('{"name":"from-file"}');
  });

  test("readJsonInput rejects invalid JSON from file payloads", () => {
    const filePath = join(testHome, "invalid-payload.json");
    writeFileSync(filePath, "{not-json", "utf8");

    expect(() => readJsonInput(filePath)).toThrow(ParseError);
  });

  test("rejects invalid JSON from --input files", () => {
    const filePath = join(testHome, "invalid-input.json");
    writeFileSync(filePath, "{not-json", "utf8");

    expect(() =>
      resolveApiRequestPayload({
        method: "POST",
        input: filePath,
      }),
    ).toThrow(ParseError);
  });

  test("returns valid --input file payloads unchanged", () => {
    const filePath = join(testHome, "valid-input.json");
    writeFileSync(filePath, '{"name":"from-input-file"}', "utf8");

    const payload = resolveApiRequestPayload({
      method: "POST",
      input: filePath,
    });

    expect(payload).toEqual({ body: '{"name":"from-input-file"}', queryFields: [] });
  });
});

describe("normalizeApiEndpoint", () => {
  test("requires a leading slash and rejects full URLs", () => {
    expect(normalizeApiEndpoint("/whoami")).toBe("/whoami");
    expect(normalizeApiEndpoint("whoami")).toBe("/whoami");
    expect(() => normalizeApiEndpoint("https://example.com/whoami")).toThrow("full URL");
  });

  test("--env replaces {environment_id}", () => {
    expect(normalizeApiEndpoint("/environments/{environment_id}/databases", "production")).toBe(
      "/environments/production/databases",
    );
  });
});

describe("executeApiHttp", () => {
  test("GET writes generic tabular output in human mode", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          body: '{"principal":{"name":"Jane"},"organization":{"name":"Acme"}}',
        },
      ]),
    );

    await runApiOperation({ method: "GET", endpoint: "/whoami" });
    expect(stdout).toContain("Acme");
  });

  test("GET --json writes raw API body", async () => {
    setCliContext({ debug: false, json: true, agent: false });
    refreshCliRuntimeContext(getCliRuntime().context);
    stdout = "";

    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          body: '{"principal":{"name":"Jane"},"organization":{"name":"Acme"}}',
        },
      ]),
    );

    await runApiOperation({ method: "GET", endpoint: "/whoami" });
    expect(stdout).toBe('{"principal":{"name":"Jane"},"organization":{"name":"Acme"}}');
  });

  test("POST -f builds JSON body", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts",
          method: "POST",
          body: '{"service_account":{"id":"sa_1","label":"CI Bot"}}',
        },
      ]),
    );

    await runApiOperation({
      method: "POST",
      endpoint: "/service_accounts",
      fields: ["label=CI Bot"],
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain('PAYLOAD={"label":"CI Bot"}');
    expect(stdout).toContain("CI Bot");
  });

  test("defaults to POST when fields are supplied without a method", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts",
          method: "POST",
          body: '{"service_account":{"id":"sa_1","label":"CI Bot"}}',
        },
      ]),
    );

    await runApiOperation({
      endpoint: "/service_accounts",
      rawFields: ["label=CI Bot"],
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("METHOD=POST");
    expect(logContent).toContain("URL=https://app.example.com/rest/v1/service_accounts");
    expect(logContent).toContain('PAYLOAD={"label":"CI Bot"}');
  });

  test("-X GET style requests put fields in the query string", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts?label=CI+Bot",
          method: "GET",
          body: '{"service_accounts":[]}',
        },
      ]),
    );

    await runApiOperation({
      method: "GET",
      endpoint: "/service_accounts",
      rawFields: ["label=CI Bot"],
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("METHOD=GET");
    expect(logContent).toContain(
      "URL=https://app.example.com/rest/v1/service_accounts?label=CI+Bot",
    );
  });

  test("typed fields preserve JSON types in request bodies", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts",
          method: "POST",
          body: "{}",
        },
      ]),
    );

    await runApiOperation({
      endpoint: "/service_accounts",
      typedFields: ["enabled=true", "priority=3", "description=null"],
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain('PAYLOAD={"enabled":true,"priority":3,"description":null}');
  });

  test("--input sends the body and moves fields to the query string", async () => {
    const payloadPath = join(testHome, "payload.json");
    writeFileSync(payloadPath, '{"name":"from-file"}', "utf8");
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts?dry_run=true",
          method: "POST",
          body: "{}",
        },
      ]),
    );

    await runApiOperation({
      method: "POST",
      endpoint: "/service_accounts",
      input: payloadPath,
      rawFields: ["dry_run=true"],
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("METHOD=POST");
    expect(logContent).toContain(
      "URL=https://app.example.com/rest/v1/service_accounts?dry_run=true",
    );
    expect(logContent).toContain('PAYLOAD={"name":"from-file"}');
  });

  test("encodes special characters in path segments", async () => {
    const id = "foo+bar";
    const encodedId = encodeURIComponent(id);
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: `/service_accounts/${encodedId}`,
          method: "GET",
          body: "{}",
        },
      ]),
    );

    await runApiOperation({ method: "GET", endpoint: `/service_accounts/${id}` });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(
      `URL=https://app.example.com/rest/v1/service_accounts/${encodedId}`,
    );
  });

  test("preserves query strings while encoding path segments", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts?limit=10&label=CI%20Bot",
          method: "GET",
          body: '{"service_accounts":[]}',
        },
      ]),
    );

    await runApiOperation({
      method: "GET",
      endpoint: "/service_accounts?limit=10&label=CI%20Bot",
    });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain(
      "URL=https://app.example.com/rest/v1/service_accounts?limit=10&label=CI%20Bot",
    );
  });

  test("DELETE with empty body is silent in human mode", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts/sa_1",
          method: "DELETE",
          body: "",
        },
      ]),
    );

    await runApiOperation({ method: "DELETE", endpoint: "/service_accounts/sa_1" });
    expect(stdout).toBe("");
  });

  test("DELETE with empty body emits deleted envelope with --json", async () => {
    setCliContext({ debug: false, json: true, agent: false });
    refreshCliRuntimeContext(getCliRuntime().context);
    stdout = "";

    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/service_accounts/sa_1",
          method: "DELETE",
          body: "",
        },
      ]),
    );

    await runApiOperation({ method: "DELETE", endpoint: "/service_accounts/sa_1" });
    expect(JSON.parse(stdout)).toEqual({ deleted: true });
  });
});
