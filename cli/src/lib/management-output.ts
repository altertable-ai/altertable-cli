import type { ArgsDef } from "citty";
import { isJsonOutput } from "@/context.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { redactSensitiveJsonValue } from "@/lib/redact.ts";
import { type ManagementOutputFormat } from "@/lib/lakehouse-client.ts";
import { renderTabularOutput, type TabularResult } from "@/lib/tabular-result.ts";

export type { ManagementOutputFormat } from "@/lib/lakehouse-client.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractManagementRows(data: unknown): Record<string, unknown>[] {
  if (!isPlainObject(data)) {
    return [];
  }

  const shouldRedact = !isJsonOutput();

  const arrayValues = Object.values(data).filter(Array.isArray) as unknown[][];
  if (arrayValues.length === 1) {
    const rows = arrayValues[0];
    if (rows === undefined) {
      return [];
    }
    const plainRows = rows.filter(isPlainObject);
    return shouldRedact ? plainRows.map(redactSensitiveRow) : plainRows;
  }

  const nestedObjects = Object.entries(data).filter(([, value]) => isPlainObject(value));
  if (nestedObjects.length === 1 && Object.keys(data).length === 1) {
    const nestedObject = nestedObjects[0]?.[1];
    if (!isPlainObject(nestedObject)) {
      return [];
    }
    const row = shouldRedact ? redactSensitiveRow(nestedObject) : nestedObject;
    return [row];
  }

  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        row[nestedKey] = shouldRedact
          ? redactSensitiveRowValue(nestedKey, nestedValue)
          : nestedValue;
      }
      continue;
    }
    row[key] = shouldRedact ? redactSensitiveRowValue(key, value) : value;
  }

  return Object.keys(row).length > 0 ? [row] : [];
}

function redactSensitiveRow(row: Record<string, unknown>): Record<string, unknown> {
  return redactSensitiveJsonValue(row) as Record<string, unknown>;
}

function redactSensitiveRowValue(key: string, value: unknown): unknown {
  const redacted = redactSensitiveJsonValue({ [key]: value }) as Record<string, unknown>;
  return redacted[key];
}

export const MANAGEMENT_FORMAT_OPTIONS = ["json", "table", "csv", "markdown"] as const;

export const MANAGEMENT_FORMAT_ARG = {
  format: {
    type: "enum" as const,
    description: "Output format: json, table, csv, or markdown",
    options: [...MANAGEMENT_FORMAT_OPTIONS],
  },
};

function collectColumnNames(rows: Record<string, unknown>[]): string[] {
  const columnNames = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columnNames.add(key);
    }
  }
  return [...columnNames].sort();
}

function managementDataToTabularResult(data: unknown): TabularResult {
  const rows = extractManagementRows(data);
  return {
    columns: collectColumnNames(rows),
    rows,
  };
}

export function renderManagementOutput(body: string, format: ManagementOutputFormat): string {
  const data = parseApiJson(body);

  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  return renderTabularOutput(managementDataToTabularResult(data), format);
}

export function withManagementFormatArg<T extends ArgsDef>(
  args: T,
): T & typeof MANAGEMENT_FORMAT_ARG {
  return {
    ...MANAGEMENT_FORMAT_ARG,
    ...args,
  };
}
