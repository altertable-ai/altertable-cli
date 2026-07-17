import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCatalogCreateRequest } from "@/commands/catalogs/lib/requests.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { CliError } from "@/lib/errors.ts";

export const catalogsCreateCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create an Altertable catalog.",
    examples: ["altertable catalogs create Analytics"],
  },
  args: {
    name: {
      type: "positional",
      description: "Catalog name",
      required: true,
    },
  },
  async run({ args, rawArgs, execution, sink }) {
    assertCatalogNameOperand(rawArgs);
    const env = requireManagementEnv(execution.profile);
    const name = String(args.name);
    const response = await sendHttp(buildCatalogCreateRequest(env, name), execution);
    await writeCommandOutput(
      {
        kind: "raw_api",
        body: response,
        humanFormatter(data) {
          const parsed = data as {
            database?: { slug?: string; name?: string; engine?: string };
            connection?: { slug?: string; name?: string; engine?: string };
          };
          const catalog = parsed.database ?? parsed.connection;
          return `Created catalog "${catalog?.name ?? name}" (slug: ${catalog?.slug ?? ""}, engine: ${catalog?.engine ?? "altertable"}, environment: ${env}).`;
        },
      },
      sink,
    );
  },
});

function assertCatalogNameOperand(rawArgs: readonly string[]): void {
  if (rawArgs.length !== 1 || rawArgs[0]?.startsWith("-")) {
    throw new CliError("Expected exactly one catalog name: altertable catalogs create <NAME>");
  }
}
