import {
  getOpenapiSpecJson,
  getOpenapiSpecYaml,
  resolveOpenapiSpecFormat,
} from "@/lib/openapi-spec.ts";
import { optionalStringArg } from "@/lib/args.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export const apiSpecCommand = defineCommand({
  meta: {
    name: "spec",
    description:
      "Print the bundled management OpenAPI specification (YAML in a terminal; JSON when piped or with --json).",
    examples: ["altertable api spec", "altertable api spec --json"],
  },
  args: {
    format: {
      type: "enum",
      options: ["json", "yaml"],
      description:
        "Output format (default: yaml in a terminal, json when piped or with global --json)",
    },
  },
  async run({ args, sink }) {
    await runApiSpecCommand(sink, { format: optionalStringArg(args, "format") });
  },
});

async function runApiSpecCommand(sink: OutputSink, options?: { format?: string }): Promise<void> {
  const format = resolveOpenapiSpecFormat(
    sink.json,
    process.stdout.isTTY === true,
    options?.format,
  );
  await writeCommandOutput(
    format === "json"
      ? { kind: "raw_api", body: getOpenapiSpecJson() }
      : { kind: "human", text: getOpenapiSpecYaml() },
    sink,
  );
}
