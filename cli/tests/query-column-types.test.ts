import { describe, expect, test } from "bun:test";
import {
  getColumnTypeMap,
  mapColumnSqlTypeToDataType,
  resolveCellDataType,
  selectDisplayColumnNames,
} from "@/lib/query-column-types.ts";

describe("mapColumnSqlTypeToDataType", () => {
  test("maps SQL types to terminal data types", () => {
    expect(mapColumnSqlTypeToDataType("UUID")).toBe("uuid");
    expect(mapColumnSqlTypeToDataType("BOOLEAN")).toBe("boolean");
    expect(mapColumnSqlTypeToDataType("BIGINT")).toBe("number");
    expect(mapColumnSqlTypeToDataType("TIMESTAMP(3)")).toBe("timestamp");
    expect(mapColumnSqlTypeToDataType("JSON")).toBe("string");
    expect(mapColumnSqlTypeToDataType("VARCHAR")).toBe("string");
  });
});

describe("resolveCellDataType", () => {
  test("uses declared SQL type for string values", () => {
    const typeMap = getColumnTypeMap([{ name: "event", type: "VARCHAR" }]);
    expect(resolveCellDataType("mcp_tool_call", "event", typeMap)).toBe("string");
    expect(resolveCellDataType("123", "duration_ms", new Map([["duration_ms", "VARCHAR"]]))).toBe(
      "string",
    );
    expect(resolveCellDataType("true", "success", new Map([["success", "VARCHAR"]]))).toBe(
      "string",
    );
    expect(
      resolveCellDataType(
        "019ee8e4-1d79-77d9-8693-1f67732b184d",
        "author_id",
        new Map([["author_id", "VARCHAR"]]),
      ),
    ).toBe("string");
    expect(resolveCellDataType("123", "duration_ms", new Map([["duration_ms", "BIGINT"]]))).toBe(
      "number",
    );
  });

  test("uses SQL type for non-string runtime values", () => {
    const typeMap = getColumnTypeMap([{ name: "duration_ms", type: "BIGINT" }]);
    expect(resolveCellDataType(285, "duration_ms", typeMap)).toBe("number");
  });

  test("classifies untyped UUID and timestamp strings by exact value shape", () => {
    expect(
      resolveCellDataType("019ee8e4-1d79-77d9-8693-1f67732b184d", "author_id", new Map()),
    ).toBe("uuid");
    expect(resolveCellDataType("2026-06-21T06:35:24.409Z", "created_at", new Map())).toBe(
      "timestamp",
    );
  });
});

describe("selectDisplayColumnNames", () => {
  const agentEventColumns = [
    "uuid",
    "event",
    "timestamp",
    "duration_ms",
    "success",
    "error_message",
    "author_type",
    "author_id",
    "tool_name",
    "input",
  ];

  test("shows all columns by default", () => {
    const { columns } = selectDisplayColumnNames(agentEventColumns, {});
    expect(columns).toEqual(agentEventColumns);
  });

  test("respects explicit column selection", () => {
    const { columns } = selectDisplayColumnNames(agentEventColumns, {
      columns: ["event", "uuid"],
    });
    expect(columns).toEqual(["event", "uuid"]);
  });
});
