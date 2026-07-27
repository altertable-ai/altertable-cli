import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { resolveCommandDescriptor, validateCommandDescriptor } from "@/lib/command-descriptor.ts";
import { VERSION } from "@/version.ts";
import {
  buildCommandReference,
  renderCliReferenceSchema,
  renderCommandReferenceJson,
  renderCommandReferenceMarkdown,
} from "@/../scripts/command-reference.ts";
import {
  parseGeneratedArtifactMode,
  updateOrCheckGeneratedArtifact,
} from "@/../scripts/generated-artifact.ts";

const descriptor = await resolveCommandDescriptor(buildMainCommand());
validateCommandDescriptor(descriptor);
const reference = buildCommandReference(descriptor, VERSION);
const mode = parseGeneratedArtifactMode(process.argv.slice(2));
const artifacts = [
  {
    outputPath: join(import.meta.dir, "../../COMMANDS.md"),
    content: renderCommandReferenceMarkdown(reference),
  },
  {
    outputPath: join(import.meta.dir, "../../cli-reference.json"),
    content: renderCommandReferenceJson(reference),
  },
  {
    outputPath: join(import.meta.dir, "../../cli-reference.schema.json"),
    content: renderCliReferenceSchema(),
  },
];

for (const artifact of artifacts) {
  updateOrCheckGeneratedArtifact({
    ...artifact,
    mode,
    generateCommand: "bun run generate:commands",
  });
  console.log(`${mode === "check" ? "Checked" : "Wrote"} ${artifact.outputPath}`);
}
