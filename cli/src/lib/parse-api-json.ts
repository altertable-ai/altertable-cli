import { ParseError } from "@/lib/errors.ts";
import { truncateBodySnippet } from "@/lib/redact.ts";

export function parseApiJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ParseError("Response body is not valid JSON.", {
      details: truncateBodySnippet(body),
    });
  }
}
