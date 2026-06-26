import { describe, expect, test } from "bun:test";
import {
  getColumnTypeMap,
  inferDataTypeFromColumnName,
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

describe("inferDataTypeFromColumnName", () => {
  test("infers types from common column naming patterns", () => {
    expect(inferDataTypeFromColumnName("author_id")).toBe("uuid");
    expect(inferDataTypeFromColumnName("created_at")).toBe("timestamp");
    expect(inferDataTypeFromColumnName("duration_ms")).toBe("number");
    expect(inferDataTypeFromColumnName("success")).toBe("boolean");
    expect(inferDataTypeFromColumnName("event")).toBeNull();
  });
});

describe("resolveCellDataType", () => {
  test("prefers runtime shape over column hints for strings", () => {
    const typeMap = getColumnTypeMap([{ name: "event", type: "VARCHAR" }]);
    expect(resolveCellDataType("mcp_tool_call", "event", typeMap)).toBe("string");
    expect(
      resolveCellDataType(
        "019ee8e4-1d79-77d9-8693-1f67732b184d",
        "author_id",
        new Map([["author_id", "VARCHAR"]]),
      ),
    ).toBe("uuid");
  });

  test("uses SQL type for non-string runtime values", () => {
    const typeMap = getColumnTypeMap([{ name: "duration_ms", type: "BIGINT" }]);
    expect(resolveCellDataType(285, "duration_ms", typeMap)).toBe("number");
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
