import { describe, expect, test } from "bun:test";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";
import { buildBodyFromFields, readJsonBody, resolveApiBody } from "@/lib/api-body.ts";
import { CliError, ParseError } from "@/lib/errors.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("management payload builders", () => {
  test("buildCreateCatalogBody includes altertable engine", () => {
    const body = buildCreateCatalogBody({ name: "My Cat" });
    expect(JSON.parse(body)).toEqual({ name: "My Cat", engine: "altertable" });
  });
});

describe("api-body helpers", () => {
  test("readJsonBody reads inline JSON and @file payloads", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "altertable-payload-test-"));
    const filePath = join(tempDir, "body.json");
    writeFileSync(filePath, '{"name":"from-file"}', "utf8");

    expect(readJsonBody('{"name":"inline"}')).toBe('{"name":"inline"}');
    expect(readJsonBody(`@${filePath}`)).toBe('{"name":"from-file"}');

    rmSync(tempDir, { recursive: true, force: true });
  });

  test("readJsonBody throws for missing @file paths", () => {
    expect(() => readJsonBody("@/no/such/file.json")).toThrow(CliError);
  });

  test("readJsonBody throws ParseError for invalid inline JSON", () => {
    expect(() => readJsonBody("{not-json")).toThrow(ParseError);
  });

  test("buildBodyFromFields merges repeatable fields", () => {
    const body = buildBodyFromFields(["label=ops", "name=analytics"]);
    expect(JSON.parse(body ?? "")).toEqual({ label: "ops", name: "analytics" });
  });

  test("resolveApiBody builds from fields for POST", () => {
    const body = resolveApiBody({
      method: "POST",
      fields: ["label=ops"],
    });
    expect(JSON.parse(body ?? "")).toEqual({ label: "ops" });
  });

  test("resolveApiBody prefers explicit body when fields are also present", () => {
    const body = resolveApiBody({
      method: "POST",
      body: '{"label":"raw"}',
      fields: ["label=ops"],
    });

    expect(body).toBe('{"label":"raw"}');
  });
});
