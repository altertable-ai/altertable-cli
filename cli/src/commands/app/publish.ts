import { optionalStringArg, stringArg } from "@/lib/args.ts";
import { requireManagementPlane } from "@/lib/auth.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { sendHttp } from "@/lib/http-request.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import {
  buildDataAppHttpRequest,
  readQueriesFile,
  readRequiredFile,
  readVariablesFile,
  type PublishedDataApp,
} from "@/commands/app/lib/remote.ts";

export const appPublishCommand = defineCommand({
  metadata: {
    name: "publish",
    description: "Create a remote data app from files.",
    examples: [
      "altertable app publish --title 'Revenue explorer' --file index.tsx --queries queries.json",
      "altertable app publish --title 'Revenue explorer' --file index.tsx --queries queries.json --variables variables.json",
    ],
  },
  args: {
    title: { type: "string", description: "Title of the data app.", required: true },
    file: {
      type: "string",
      description: "Path to the single-file React source (index.tsx).",
      required: true,
      completion: "file",
    },
    queries: {
      type: "string",
      description: "Path to queries JSON (object of id → SQL, or [{id, sql}]).",
      required: true,
      completion: "file",
    },
    variables: {
      type: "string",
      description: "Path to variables JSON array. Defaults to no variables.",
      completion: "file",
    },
    description: { type: "string", description: "Optional description of the data app." },
  },
  async run({ args, execution, sink }) {
    const env = requireManagementPlane(execution.profile, {
      requirement: "Publishing a remote data app requires the management API",
    });
    const title = stringArg(args, "title");
    const response = parseApiJson(
      await sendHttp(
        buildDataAppHttpRequest(env, "POST", "/data_apps", {
          title,
          index_tsx: await readRequiredFile(stringArg(args, "file"), "source"),
          queries: await readQueriesFile(stringArg(args, "queries")),
          variables: await readVariablesFile(optionalStringArg(args, "variables")),
          description: optionalStringArg(args, "description"),
        }),
        execution,
      ),
    ) as { data_app?: PublishedDataApp };
    const dataApp = response.data_app ?? {};
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { slug: dataApp.slug, url: dataApp.url },
        humanText: `Published ${dataApp.title ?? title} (${dataApp.slug ?? ""}).\n${dataApp.url ?? ""}`,
      },
      sink,
    );
  },
});
