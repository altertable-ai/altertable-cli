import type { LakehouseColumn, LakehouseQueryResult } from "@/lib/lakehouse-ndjson.ts";
import { classifyStringDataType, type TerminalDataType } from "@/ui/terminal/styles.ts";

export type ColumnTypeMap = Map<string, string | undefined>;

export function getColumnTypeMap(columns: LakehouseQueryResult["columns"]): ColumnTypeMap {
  const typeMap: ColumnTypeMap = new Map();
  if (!Array.isArray(columns) || columns.length === 0) {
    return typeMap;
  }
  if (typeof columns[0] === "string") {
    return typeMap;
  }
  for (const column of columns as LakehouseColumn[]) {
    const name = column.name;
    if (typeof name === "string" && name.length > 0) {
      typeMap.set(name, typeof column.type === "string" ? column.type : undefined);
    }
  }
  return typeMap;
}

export function mapColumnSqlTypeToDataType(sqlType: string | undefined): TerminalDataType | null {
  if (sqlType === undefined || sqlType.length === 0) {
    return null;
  }
  const normalized = sqlType.toUpperCase();
  if (normalized.includes("UUID")) {
    return "uuid";
  }
  if (normalized.includes("BOOL")) {
    return "boolean";
  }
  if (/INT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|BIGINT|SMALLINT|TINYINT/.test(normalized)) {
    return "number";
  }
  if (/TIMESTAMP|DATETIME|DATE|TIME/.test(normalized)) {
    return "timestamp";
  }
  if (normalized.includes("JSON")) {
    return "string";
  }
  return "string";
}

export function resolveCellDataType(
  value: unknown,
  columnName: string | undefined,
  columnTypeMap: ColumnTypeMap,
): TerminalDataType {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return "number";
  }
  if (typeof value === "string") {
    if (columnName !== undefined) {
      const sqlType = columnTypeMap.get(columnName);
      const fromSql = mapColumnSqlTypeToDataType(sqlType);
      if (fromSql !== null) {
        return fromSql;
      }
    }
    return classifyStringDataType(value);
  }
  return "string";
}

export function selectDisplayColumnNames(
  allNames: string[],
  options: { columns?: string[] },
): { columns: string[] } {
  if (options.columns !== undefined && options.columns.length > 0) {
    const nameSet = new Set(allNames);
    const filtered = options.columns.filter((name) => nameSet.has(name));
    const columns = filtered.length > 0 ? filtered : allNames;
    return { columns };
  }

  return { columns: allNames };
}
