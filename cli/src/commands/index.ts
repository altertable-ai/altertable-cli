import type { ArgsDef, CommandDef } from "citty";
import { loginCommand } from "@/commands/login/index.ts";
import { logoutCommand } from "@/commands/logout/index.ts";
import { profileCommand } from "@/commands/profile/index.ts";
import { catalogsCommand } from "@/commands/catalogs/index.ts";
import { duckdbCommand } from "@/commands/duckdb/index.ts";
import { appendCommand } from "@/commands/append/index.ts";
import { queryCommand, normalizeQueryInvocatorRawArgs } from "@/commands/query/index.ts";
import { schemaCommand } from "@/commands/schema/index.ts";
import { uploadCommand } from "@/commands/upload/index.ts";
import { upsertCommand } from "@/commands/upsert/index.ts";
import { apiCommand, normalizeApiInvocatorRawArgs } from "@/commands/api/index.ts";
import { createCompletionCommand } from "@/commands/completion/index.ts";
import { updateCommand } from "@/commands/update/index.ts";

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
