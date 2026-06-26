import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { buildBodyFromFields, readJsonBody, resolveApiBody, extractHeaderArgs, parseApiHeaders } from "@/lib/api-body.ts";
import { normalizeApiEndpoint, runApiHttp } from "@/lib/api-http.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

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
  setCliContext({ debug: false, json: false });
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

describe("api-body", () => {
  test("buildBodyFromFields merges key=value pairs into JSON", () => {
    const body = buildBodyFromFields(["label=CI Bot", "name=Analytics"]);
    expect(JSON.parse(body ?? "")).toEqual({ label: "CI Bot", name: "Analytics" });
  });

  test("resolveApiBody returns body when only --body is provided", () => {
    const body = resolveApiBody({
      method: "POST",
      body: '{"label":"raw"}',
    });
    expect(body).toBe('{"label":"raw"}');
  });

  test("resolveApiBody rejects mixing body and fields", () => {
    const body = resolveApiBody({
      method: "POST",
      body: '{"label":"raw"}',
      rawFields: ["label=flags"],
    });

    expect(body).toBe('{"label":"raw"}');
  });

  test("resolveApiBody keeps fields out of GET request bodies", () => {
    const body = resolveApiBody({
      method: "GET",
      rawFields: ["label=query"],
    });

    expect(body).toBeUndefined();
  });

  test("resolveApiBody rejects explicit body input for methods without request bodies", () => {
    expect(() =>
      resolveApiBody({
        method: "GET",
        body: '{"label":"bad"}',
      }),
    ).toThrow("GET requests do not accept a body");
  });

  test("readJsonBody reads @file payloads", () => {
    const filePath = join(testHome, "payload.json");
    writeFileSync(filePath, '{"name":"from-file"}', "utf8");
    expect(readJsonBody(`@${filePath}`)).toBe('{"name":"from-file"}');
  });

  test("extractHeaderArgs collects -H and --header values", () => {
    expect(
      extractHeaderArgs(["api", "/whoami", "-H", "X-A: 1", "--header=X-B: 2"]),
    ).toEqual(["X-A: 1", "X-B: 2"]);
  });

  test("parseApiHeaders splits key:value pairs and trims whitespace", () => {
    expect(parseApiHeaders(["X-A: 1", "Accept:application/json"])).toEqual({
      "X-A": "1",
      Accept: "application/json",
    });
  });

  test("parseApiHeaders rejects entries without a colon", () => {
    expect(() => parseApiHeaders(["bogus"])).toThrow("Expected key:value");
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

describe("runApiHttp", () => {
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

    await runApiHttp({ method: "GET", endpoint: "/whoami" });
    expect(stdout).toContain("Acme");
  });

  test("GET --json writes raw API body", async () => {
    setCliContext({ debug: false, json: true });
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

    await runApiHttp({ method: "GET", endpoint: "/whoami" });
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

    await runApiHttp({
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

    await runApiHttp({
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

    await runApiHttp({
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

    await runApiHttp({
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

    await runApiHttp({
      method: "POST",
      endpoint: "/service_accounts",
      input: `@${payloadPath}`,
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

    await runApiHttp({ method: "GET", endpoint: `/service_accounts/${id}` });

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

    await runApiHttp({ method: "GET", endpoint: "/service_accounts?limit=10&label=CI%20Bot" });

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

    await runApiHttp({ method: "DELETE", endpoint: "/service_accounts/sa_1" });
    expect(stdout).toBe("");
  });

  test("DELETE with empty body emits deleted envelope with --json", async () => {
    setCliContext({ debug: false, json: true });
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

    await runApiHttp({ method: "DELETE", endpoint: "/service_accounts/sa_1" });
    expect(JSON.parse(stdout)).toEqual({ deleted: true });
  });

  test("--header sends custom headers", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([{ urlPattern: "/whoami", method: "GET", body: "{}" }]),
    );

    await runApiHttp({ method: "GET", endpoint: "/whoami", headers: ["X-Demo: yes"] });

    const logContent = readFileSync(logFile, "utf8");
    expect(logContent).toContain("X-Demo: yes");
  });

  test("--include prints the status line, headers, and body", async () => {
    writeFileSync(
      mockFile,
      JSON.stringify([
        {
          urlPattern: "/whoami",
          method: "GET",
          status: 200,
          statusText: "OK",
          headers: { "X-Trace": "abc" },
          body: '{"ok":true}',
        },
      ]),
    );

    await runApiHttp({ method: "GET", endpoint: "/whoami", include: true });

    expect(stdout).toContain("HTTP/1.1 200 OK");
    expect(stdout).toContain("X-Trace: abc");
    expect(stdout).toContain('{"ok":true}');
  });
});
