import { getOpenapiSpecJson, getOpenapiSpecYaml } from "@/lib/openapi-spec.ts";
import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export const apiSpecCommand = defineCommand({
  meta: {
    name: "spec",
    description:
      "Print the bundled management OpenAPI specification (YAML by default; JSON with --json).",
    examples: ["altertable api spec", "altertable api spec --json"],
  },
  async run({ sink }) {
    await runApiSpecCommand(sink);
  },
});

async function runApiSpecCommand(sink: OutputSink): Promise<void> {
  await writeCommandOutput(
    sink.json
      ? { kind: "raw_api", body: getOpenapiSpecJson() }
      : { kind: "human", text: getOpenapiSpecYaml() },
    sink,
  );
}
