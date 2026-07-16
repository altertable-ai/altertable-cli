import { defineArgs } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import { requestReadTimeoutArgs } from "@/lib/timeout-args.ts";

export const LAKEHOUSE_FILE_FORMAT_OPTIONS = ["csv", "json", "parquet"] as const;

export const lakehouseTableArgs = defineArgs({
  catalog: { type: "string", description: "Catalog name", required: true },
  schema: { type: "string", description: "Schema name", required: true },
  table: { type: "string", description: "Table name", required: true },
});

export const lakehouseFileArgs = defineArgs({
  ...lakehouseTableArgs,
  format: {
    type: "enum",
    description: "Optional file format hint for the Content-Type header",
    options: [...LAKEHOUSE_FILE_FORMAT_OPTIONS],
  },
  file: { type: "string", description: "Local file to upload", required: true },
  ...requestReadTimeoutArgs,
});

export function parseLakehouseFileContentType(format: string | undefined): string | undefined {
  if (!format) return undefined;

  switch (format.toLowerCase()) {
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "parquet":
      return "application/vnd.apache.parquet";
    default:
      throw new CliError("--format must be one of: csv, json, parquet.");
  }
}
