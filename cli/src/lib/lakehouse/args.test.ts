import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import { parseLakehouseFileContentType } from "@/lib/lakehouse/args.ts";

describe("parseLakehouseFileContentType", () => {
  test("maps supported lakehouse file formats to content types", () => {
    expect(parseLakehouseFileContentType(undefined)).toBeUndefined();
    expect(parseLakehouseFileContentType("csv")).toBe("text/csv");
    expect(parseLakehouseFileContentType("json")).toBe("application/json");
    expect(parseLakehouseFileContentType("parquet")).toBe("application/vnd.apache.parquet");
  });

  test("rejects unknown lakehouse file formats", () => {
    expect(() => parseLakehouseFileContentType("xml")).toThrow(CliError);
    expect(() => parseLakehouseFileContentType("xml")).toThrow(
      "--format must be one of: csv, json, parquet",
    );
  });
});
