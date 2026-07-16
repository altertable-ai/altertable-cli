import { CliError, serializeCliError } from "@/lib/errors.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export function renderCliErrorJson(error: unknown): string {
  return JSON.stringify(serializeCliError(error));
}

export function renderCliError(error: unknown): string {
  if (error instanceof CliError || (error instanceof Error && error.name === "CLIError")) {
    return renderDisplayText([span("ERROR", "error"), span(` ${error.message}`)]);
  }
  return renderDisplayText([span("ERROR", "error"), span(" Unexpected error.")]);
}

export function renderCliErrorDetails(details: string): string {
  return details
    .split(/\r\n|\r|\n/)
    .map((line, index) =>
      index === 0
        ? renderDisplayText([span("ERROR", "error"), span(` ${line}`)])
        : renderDisplayText(line),
    )
    .join("\n");
}
