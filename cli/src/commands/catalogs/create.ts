import { CliError } from "@/lib/errors.ts";
import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCatalogCreateRequest } from "@/commands/catalogs/lib/requests.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";

export const catalogsCreateCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a catalog. Only the 'altertable' engine is supported.",
    examples: ["altertable catalogs create --engine altertable --name Analytics"],
  },
  args: {
    engine: {
      type: "enum",
      description: "Catalog engine (only 'altertable' is supported)",
      required: true,
      options: ["altertable"],
    },
    name: { type: "string", description: "Catalog name", required: true },
  },
  async run({ args, execution, sink }) {
    if (args.engine !== "altertable") {
      throw new CliError(
        `Only the 'altertable' engine is supported (got '${String(args.engine)}').`,
      );
    }
    const env = requireManagementEnv(execution.profile);
    const fallbackName = String(args.name);
    const response = await sendHttp(buildCatalogCreateRequest(env, fallbackName), execution);
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
          return `Created catalog "${catalog?.name ?? fallbackName}" (slug: ${catalog?.slug ?? ""}, engine: ${catalog?.engine ?? "altertable"}, environment: ${env}).`;
        },
      },
      sink,
    );
  },
});
