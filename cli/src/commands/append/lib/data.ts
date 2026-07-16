import { readFileSync } from "node:fs";
import { CliError } from "@/lib/errors.ts";

export function parseAppendJsonContent(dataArg: string): string {
  let jsonContent = dataArg;
  if (jsonContent.startsWith("@")) {
    const filePath = jsonContent.slice(1);
    try {
      jsonContent = readFileSync(filePath, "utf8");
    } catch {
      throw new CliError(`File not found: ${filePath}`);
    }
  }

  const firstCharacter = jsonContent.trimStart()[0];
  if (firstCharacter !== "{" && firstCharacter !== "[") {
    throw new CliError("Data must be a JSON object or array.");
  }

  try {
    return JSON.stringify(JSON.parse(jsonContent));
  } catch {
    throw new CliError("Data must be valid JSON.");
  }
}
