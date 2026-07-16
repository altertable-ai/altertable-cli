import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import {
  parsePagerOptions,
  parseQueryDisplayOptions,
  parseQueryOutputOptions,
  parseQueryLayout,
  parseQueryResultFormatArg,
  parseLakehouseFileContentType,
} from "@/lib/lakehouse/args.ts";
import { parseQueryResultFormat } from "@/lib/lakehouse-client.ts";
import { setCliContext } from "@/context.ts";

describe("parseQueryDisplayOptions", () => {
  test("parses human layout values", () => {
    const options = parseQueryDisplayOptions({ layout: "line" }, []);
    expect(options.layout).toBe("line");
  });

  test("parses max width", () => {
    const options = parseQueryDisplayOptions({ "max-width": "24" }, []);
    expect(options.maxColumnWidth).toBe(24);
  });
});

describe("parseQueryLayout", () => {
  test("parses auto, table, and line", () => {
    expect(parseQueryLayout({ layout: "auto" })).toBe("auto");
    expect(parseQueryLayout({ layout: "table" })).toBe("table");
    expect(parseQueryLayout({ layout: "line" })).toBe("line");
  });

  test("rejects unknown layout values", () => {
    expect(() => parseQueryLayout({ layout: "expanded" })).toThrow(CliError);
  });
});

describe("parseQueryResultFormat", () => {
  test("parses query result formats", () => {
    expect(parseQueryResultFormat("human")).toBe("human");
    expect(parseQueryResultFormat("json")).toBe("json");
    expect(parseQueryResultFormat("csv")).toBe("csv");
    expect(parseQueryResultFormat("markdown")).toBe("markdown");
  });

  test("rejects unknown query result formats", () => {
    expect(() => parseQueryResultFormat("duckbox")).toThrow(CliError);
  });
});

describe("parseQueryResultFormatArg", () => {
  test("defaults to json when --agent is set", () => {
    setCliContext({ debug: false, json: false, agent: true });
    expect(parseQueryResultFormatArg({}, [])).toBe("json");
    setCliContext({ debug: false, json: false, agent: false });
  });

  test("rejects human-only flags with --agent", () => {
    setCliContext({ debug: false, json: false, agent: true });
    expect(() => parseQueryResultFormatArg({}, ["--layout", "table"])).toThrow(CliError);
    expect(() => parseQueryResultFormatArg({}, ["--pager", "never"])).toThrow(CliError);
    expect(() => parseQueryResultFormatArg({}, ["--max-width", "32"])).toThrow(CliError);
    setCliContext({ debug: false, json: false, agent: false });
  });
});

describe("parsePagerOptions", () => {
  test("parses pager enum values", () => {
    expect(parsePagerOptions({ pager: "never" })).toEqual({ mode: "never" });
  });

  test("rejects unknown pager values", () => {
    expect(() => parsePagerOptions({ pager: "sometimes" })).toThrow(CliError);
  });

  test("forces never pager in agent mode", () => {
    setCliContext({ debug: false, json: false, agent: true });
    expect(parsePagerOptions({})).toEqual({ mode: "never" });
    setCliContext({ debug: false, json: false, agent: false });
  });
});

describe("parseQueryOutputOptions", () => {
  test("composes query output settings from one validation pass", () => {
    const options = parseQueryOutputOptions(
      { format: "markdown", layout: "line", "max-width": "24", pager: "never" },
      [],
    );
    expect(options.format).toBe("markdown");
    expect(options.displayOptions.layout).toBe("line");
    expect(options.displayOptions.maxColumnWidth).toBe(24);
    expect(options.pagerOptions).toEqual({ mode: "never" });
  });
});

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
