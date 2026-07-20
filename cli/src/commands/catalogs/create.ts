import { requireManagementEnv } from "@/lib/auth.ts";
import { buildCatalogCreateRequest } from "@/commands/catalogs/lib/requests.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";

export const catalogsCreateCommand = defineCommand({
  metadata: {
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
  async run({ args, execution, sink }) {
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
