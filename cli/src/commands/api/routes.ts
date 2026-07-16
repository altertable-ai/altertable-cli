import { optionalStringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { apiOperationDetails, apiOperationsJson, apiRouteRows } from "@/features/api/model.ts";
import { formatApiOperationDetails, formatApiRoutes } from "@/features/api/render.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export async function runApiRoutesCommand(sink: OutputSink, operationId?: string): Promise<void> {
  await writeCommandOutput(
    operationId
      ? {
          kind: "normalized",
          data: apiOperationDetails(operationId),
          humanText: formatApiOperationDetails(apiOperationDetails(operationId)),
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

export const apiRoutesCommand = defineCommand({
  meta: {
    name: "routes",
    description: "List management API paths and methods from the bundled OpenAPI spec.",
    examples: ["altertable api routes", "altertable api routes createDatabase"],
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
