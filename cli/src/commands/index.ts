import type { ArgsDef, CommandDef } from "citty";
import { loginCommand, logoutCommand } from "@/commands/login.ts";
import { profileCommand } from "@/commands/profile.ts";
import { catalogsCommand } from "@/commands/catalogs.ts";
import { duckdbCommand } from "@/commands/duckdb.ts";
import { appendCommand } from "@/commands/lakehouse/append.ts";
import { queryCommand, normalizeQueryInvocatorRawArgs } from "@/commands/lakehouse/query.ts";
import { schemaCommand } from "@/commands/lakehouse/schema.ts";
import { uploadCommand } from "@/commands/lakehouse/upload.ts";
import { upsertCommand } from "@/commands/lakehouse/upsert.ts";
import { apiCommand, normalizeApiInvocatorRawArgs } from "@/commands/api.ts";
import { createCompletionCommand } from "@/commands/completion.ts";
import { updateCommand } from "@/commands/update.ts";

export function buildTopLevelCommands(
  getMainCommand: () => CommandDef,
): Record<string, CommandDef> {
  return {
    login: loginCommand,
    logout: logoutCommand,
    profile: profileCommand,
    catalogs: catalogsCommand,
    query: queryCommand,
    schema: schemaCommand,
    duckdb: duckdbCommand,
    append: appendCommand,
    upload: uploadCommand,
    upsert: upsertCommand,
    api: apiCommand,
    update: updateCommand,
    completion: createCompletionCommand(getMainCommand),
  };
}

export function normalizeCommandRawArgs(rawArgs: readonly string[], rootArgs: ArgsDef): string[] {
  return normalizeQueryInvocatorRawArgs(normalizeApiInvocatorRawArgs(rawArgs, rootArgs), rootArgs);
}
