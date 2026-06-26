import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import {
  parseAppendJsonContent,
  parsePagerOptions,
  parseQueryDisplayOptions,
  validateUploadPrimaryKey,
} from "@/commands/lakehouse-args.ts";

describe("parseQueryDisplayOptions", () => {
  test("rejects --expanded and --no-expanded together", () => {
    expect(() => parseQueryDisplayOptions({ expanded: true, "no-expanded": true }, [])).toThrow(
      CliError,
    );
  });
});

describe("parsePagerOptions", () => {
  test("rejects --pager and --no-pager together", () => {
    expect(() => parsePagerOptions({ pager: true, "no-pager": true })).toThrow(CliError);
  });
});

describe("parseAppendJsonContent", () => {
  test("rejects data not starting with object or array", () => {
    expect(() => parseAppendJsonContent("not-json")).toThrow(CliError);
  });

  test("rejects @missing.json file paths", () => {
    expect(() => parseAppendJsonContent("@/no/such/missing.json")).toThrow(CliError);
    expect(() => parseAppendJsonContent("@/no/such/missing.json")).toThrow(/File not found/);
  });

  test("accepts inline JSON objects", () => {
    expect(parseAppendJsonContent('{"id":1}')).toBe('{"id":1}');
  });
});

describe("validateUploadPrimaryKey", () => {
  test("requires primary key for upsert mode", () => {
    expect(() => validateUploadPrimaryKey("upsert", undefined)).toThrow(CliError);
    expect(() => validateUploadPrimaryKey("upsert", undefined)).toThrow(
      "--primary-key is required",
    );
  });
});
