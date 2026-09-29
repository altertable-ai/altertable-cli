import { optionalStringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { apiOperationDetails, apiOperationsJson, apiRouteRows } from "@/commands/api/lib/model.ts";
import { formatApiOperationDetails, formatApiRoutes } from "@/commands/api/lib/render.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export const apiRouteCommand = defineCommand({
  metadata: {
    name: "route",
    description: "List management API paths and methods from the bundled OpenAPI spec.",
    examples: ["altertable api route", "altertable api route createDatabase"],
  },
  args: {
    operation: {
      type: "positional",
      description: "Optional operationId to inspect, e.g. createDatabase",
      required: false,
    },
  },
  async run({ args, sink }) {
    await runApiRoutesCommand(sink, optionalStringArg(args, "operation"));
  },
});

export const apiRoutesCommand = defineCommand({
  ...apiRouteCommand,
  metadata: { name: "routes", hidden: true, description: "Alias for altertable api route." },
});

async function runApiRoutesCommand(sink: OutputSink, operationId?: string): Promise<void> {
  const operation = operationId ? apiOperationDetails(operationId) : undefined;
  await writeCommandOutput(
    operation
      ? {
          kind: "normalized",
          data: operation,
          humanText: formatApiOperationDetails(operation),
        }
      : {
          kind: "normalized",
          data: apiOperationsJson(),
          humanText: formatApiRoutes(apiRouteRows()),
          pageHumanText: true,
        },
    sink,
  );
}
