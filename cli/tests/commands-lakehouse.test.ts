import { describe, expect, test } from "bun:test";
import { CliError } from "@/lib/errors.ts";
import {
  parseAppendJsonContent,
  parsePagerOptions,
  parseQueryDisplayOptions,
  parseQueryOutputOptions,
  parseQueryLayout,
  parseQueryResultFormatArg,
  validateUploadPrimaryKey,
} from "@/commands/lakehouse-args.ts";
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
