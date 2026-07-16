import type { ArgsDef } from "citty";
import { booleanArg, stringArg } from "@/lib/operation-codec.ts";
import { progressPlan } from "@/lib/operation-effect.ts";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { defineGroupCommand, defineHttpCommand } from "@/lib/operation-command-builders.ts";
import { parseAppendJsonContent } from "@/lib/lakehouse/args.ts";
import {
  lakehouseAppendOperation,
  lakehouseAppendTaskOperation,
} from "@/lib/lakehouse-operations.ts";

const appendRunArgs = {
  catalog: { type: "string", description: "Catalog name", required: true },
  schema: { type: "string", description: "Schema name", required: true },
  table: { type: "string", description: "Table name", required: true },
  data: { type: "string", description: "JSON object, array, or @file", required: true },
  sync: {
    type: "boolean",
    description: "Wait for the append operation to finish before returning",
  },
} satisfies ArgsDef;

const appendGroupArgs = {
  ...appendRunArgs,
  catalog: { ...appendRunArgs.catalog, required: false },
  schema: { ...appendRunArgs.schema, required: false },
  table: { ...appendRunArgs.table, required: false },
  data: { ...appendRunArgs.data, required: false },
} satisfies ArgsDef;

const appendRowsCommand = defineOperationCommand({
  id: "lakehouse.append.run",
  capabilities: ["lakehouse-http", "progress"],
  catalog: {
    effects: ["http", "progress"],
    planes: ["lakehouse"],
    mutates: true,
    output: "raw-api",
  },
  meta: {
    name: "run",
    description: "Append JSON rows to a table.",
  },
  args: appendRunArgs,
  parse({ args }) {
    const catalog = stringArg(args, "catalog");
    const schema = stringArg(args, "schema");
    const table = stringArg(args, "table");
    const payload = parseAppendJsonContent(stringArg(args, "data"));
    return { catalog, schema, table, payload, sync: booleanArg(args, "sync") };
  },
  run(input, context) {
    const effect = lakehouseAppendOperation.effect(input, context);
    return input.sync
      ? progressPlan("Waiting for append to complete…", effect)
      : lakehouseAppendOperation.plan(input, context);
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

const appendStatusCommand = defineHttpCommand({
  id: "lakehouse.append.status",
  plane: "lakehouse",
  operation: lakehouseAppendTaskOperation,
  output: "raw-api",
  meta: {
    name: "status",
    description: "Fetch status for an append operation.",
  },
  args: {
    "append-id": {
      type: "positional",
      description: "Append id returned by append",
      required: true,
    },
  },
  parse({ args }) {
    return stringArg(args, "append-id");
  },
  present(response) {
    return { kind: "raw_api", body: response };
  },
});

export const appendCommand = defineGroupCommand({
  meta: {
    name: "append",
    commandGroup: "ingest",
    description: "Append JSON rows to a table.",
    examples: [
      "altertable append --catalog db --schema public --table events --data '[{\"id\":1}]'",
      "altertable append status <append-id>",
    ],
  },
  default: "run",
  args: appendGroupArgs,
  subCommands: {
    run: appendRowsCommand,
    status: appendStatusCommand,
  },
});
