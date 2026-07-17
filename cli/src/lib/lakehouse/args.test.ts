import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import {
  inferLakehouseFileFormat,
  parseLakehouseFileContentType,
  parseLakehouseTarget,
} from "@/lib/lakehouse/args.ts";

describe("parseLakehouseFileContentType", () => {
  test("maps supported lakehouse file formats to content types", () => {
    expect(parseLakehouseFileContentType(undefined, "data.CSV")).toBe("text/csv");
    expect(parseLakehouseFileContentType("json", "data")).toBe("application/json");
    expect(parseLakehouseFileContentType("parquet", "data.csv")).toBe(
      "application/vnd.apache.parquet",
    );
    expect(inferLakehouseFileFormat("data.JSON")).toBe("json");
  });

  test("rejects unknown lakehouse file formats", () => {
    expect(() => parseLakehouseFileContentType("xml", "data.xml")).toThrow(CliError);
    expect(() => parseLakehouseFileContentType(undefined, "data.xml")).toThrow(
      "Could not infer the input format",
    );
  });
});

describe("parseLakehouseTarget", () => {
  test("parses and percent-decodes exactly three components", () => {
    expect(parseLakehouseTarget("my%2Ecatalog.public.users")).toEqual({
      catalog: "my.catalog",
      schema: "public",
      table: "users",
    });
  });

  test("rejects shorthand, empty components, and malformed encoding", () => {
    expect(() => parseLakehouseTarget("public.users")).toThrow(CliError);
    expect(() => parseLakehouseTarget("catalog..users")).toThrow(CliError);
    expect(() => parseLakehouseTarget("catalog.public.%ZZ")).toThrow("Invalid percent encoding");
  });
});
