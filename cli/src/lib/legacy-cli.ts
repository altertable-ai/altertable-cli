import { CliError } from "@/lib/errors.ts";
import { findFirstPositionalToken, valueFlagsFor } from "@/lib/command-delegation.ts";
import type { CommandArgs } from "@/lib/command.ts";

const API_METHODS = new Set(["GET", "POST", "PATCH", "DELETE", "PUT"]);
const API_VALUE_FLAGS = new Set([
  "-X",
  "--method",
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "--input",
  "--env",
  "--format",
]);

function migrationError(previous: string, replacement: string): never {
  throw new CliError(`${previous} was removed. Use ${replacement}.`);
}

export function assertNoRemovedSyntax(rawArgs: readonly string[], rootArgs: CommandArgs): void {
  const commandToken = findFirstPositionalToken(rawArgs, {
    valueFlags: valueFlagsFor(rootArgs),
  });
  if (!commandToken) return;

  const commandArgs = rawArgs.slice(commandToken.index + 1);
  const operand = findFirstPositionalToken(commandArgs, {
    valueFlags: commandToken.value === "api" ? API_VALUE_FLAGS : undefined,
  })?.value;

  if (commandToken.value === "profile") {
    if (commandArgs.includes("--configure")) {
      migrationError('"profile --configure"', '"profile configure [NAME]"');
    }
    if (operand === "create") migrationError('"profile create"', '"profile configure [NAME]"');
    if (operand === "use") migrationError('"profile use"', '"profile switch <NAME>"');
    if (operand === "direnv") migrationError('"profile direnv"', '"profile env [NAME]"');
  }
  if (commandToken.value === "query" && operand === "run") {
    migrationError('"query run"', '"query <SQL>"');
  }
  if (commandToken.value === "append" && operand === "run") {
    migrationError('"append run"', '"append <DATA> --to <TARGET>"');
  }
  if (commandToken.value === "catalogs" && operand === "list") {
    migrationError('"catalogs list"', '"catalogs"');
  }
  if (commandToken.value === "completion" && ["bash", "fish", "zsh"].includes(operand ?? "")) {
    migrationError(`"completion ${operand}"`, `"completion generate ${operand}"`);
  }
  if (commandToken.value === "api" && API_METHODS.has(operand?.toUpperCase() ?? "")) {
    migrationError(`"api ${operand} <PATH>"`, `"api <PATH> -X ${operand?.toUpperCase()}"`);
  }
}
