import { statSync } from "node:fs";
import { CliError } from "@/lib/errors.ts";

export function getFileSizeBytes(filePath: string): number {
  try {
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) throw new CliError(`File not found: ${filePath}`);
    return fileStat.size;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`File not found: ${filePath}`);
  }
}
