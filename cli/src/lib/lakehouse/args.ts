import { extname } from "node:path";
import { defineArguments } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";

export const LAKEHOUSE_FILE_FORMAT_OPTIONS = ["csv", "json", "parquet"] as const;

export const lakehouseFileArgs = defineArguments({
  file: {
    type: "positional",
    description: "Local file to upload",
    required: true,
    completion: "file",
  },
  to: {
    type: "string",
    description: "Destination as catalog.schema.table",
    required: true,
  },
  format: {
    type: "enum",
    description: "Input format; inferred from the filename when omitted",
    options: [...LAKEHOUSE_FILE_FORMAT_OPTIONS],
  },
});

export type LakehouseTarget = {
  catalog: string;
  schema: string;
  table: string;
};

export function parseLakehouseTarget(target: string): LakehouseTarget {
  const components = target.split(".");
  if (components.length !== 3 || components.some((component) => component.length === 0)) {
    throw new CliError("--to must use catalog.schema.table notation.");
  }
  try {
    const [catalog, schema, table] = components.map((component) => decodeURIComponent(component));
    if (!catalog || !schema || !table) {
      throw new CliError("--to must use catalog.schema.table notation.");
    }
    return { catalog, schema, table };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("Invalid percent encoding in --to target.");
  }
}

export function inferLakehouseFileFormat(filePath: string): string | undefined {
  const extension = extname(filePath).slice(1).toLowerCase();
  return LAKEHOUSE_FILE_FORMAT_OPTIONS.includes(
    extension as (typeof LAKEHOUSE_FILE_FORMAT_OPTIONS)[number],
  )
    ? extension
    : undefined;
}

export function parseLakehouseFileContentType(
  format: string | undefined,
  filePath: string,
): string {
  const resolvedFormat = format?.toLowerCase() ?? inferLakehouseFileFormat(filePath);
  switch (resolvedFormat) {
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "parquet":
      return "application/vnd.apache.parquet";
    default:
      throw new CliError(
        "Could not infer the input format. Use a .csv, .json, or .parquet filename, or pass --format.",
      );
  }
}
