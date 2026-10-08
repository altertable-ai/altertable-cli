import { optionalStringArg, stringArg } from "@/lib/args.ts";
import { requireManagementPlane } from "@/lib/auth.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { CliError } from "@/lib/errors.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import {
  buildDataAppHttpRequest,
  readQueriesFile,
  readRequiredFile,
  readVariablesFile,
  type RemoteDataAppPayload,
  type PublishedDataApp,
} from "@/commands/app/lib/remote.ts";

export const appUpdateCommand = defineCommand({
  metadata: {
    name: "update",
    description: "Update a data app from files. Omitted fields are left unchanged.",
    examples: [
      "altertable app update APP-1 --file index.tsx",
      "altertable app update APP-1 --title 'Revenue explorer' --file index.tsx --queries queries.json",
    ],
  },
  args: {
    slug: {
      type: "positional",
      description: "Data app slug to update (e.g. APP-1).",
      required: true,
    },
    title: { type: "string", description: "New title of the data app." },
    file: {
      type: "string",
      description: "Path to replacement single-file React source (index.tsx).",
      completion: "file",
    },
    queries: {
      type: "string",
      description: "Path to queries JSON. Replaces the full set when provided.",
      completion: "file",
    },
    variables: {
      type: "string",
      description: "Path to variables JSON. Replaces the full set when provided.",
      completion: "file",
    },
    description: { type: "string", description: "New description of the data app." },
  },
  async run({ args, execution, sink }) {
    const env = requireManagementPlane(execution.profile, {
      requirement: "Updating a data app requires the management API",
    });
    const slug = stringArg(args, "slug");
    const body = await updatePayload(args);
    if (Object.keys(body).length === 0) {
      throw new CliError(
        "Provide at least one of --title, --description, --file, --queries, or --variables.",
      );
    }
    const response = parseApiJson(
      await sendHttp(buildDataAppHttpRequest(env, "PATCH", `/data_apps/${slug}`, body), execution),
    ) as { data_app?: PublishedDataApp };
    const dataApp = response.data_app ?? {};
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { slug: dataApp.slug ?? slug, url: dataApp.url },
        humanText: `Updated ${dataApp.title ?? dataApp.slug ?? slug}.\n${dataApp.url ?? ""}`,
      },
      sink,
    );
  },
});

async function updatePayload(args: Record<string, unknown>): Promise<RemoteDataAppPayload> {
  const body: RemoteDataAppPayload = {};
  const title = optionalStringArg(args, "title");
  const description = optionalStringArg(args, "description");
  const file = optionalStringArg(args, "file");
  const queries = optionalStringArg(args, "queries");
  const variables = optionalStringArg(args, "variables");
  if (title !== undefined) body.title = title;
  if (description !== undefined) body.description = description;
  if (file !== undefined) body.index_tsx = await readRequiredFile(file, "source");
  if (queries !== undefined) body.queries = await readQueriesFile(queries);
  if (variables !== undefined) body.variables = await readVariablesFile(variables);
  return body;
}
