import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { resolveCommandDescriptor, validateCommandDescriptor } from "@/lib/command-descriptor.ts";
import { renderCommandReference } from "@/lib/command-reference.ts";
import { renderCommandReferenceJson } from "@/lib/command-reference-json.ts";
import { VERSION } from "@/version.ts";
import {
  parseGeneratedArtifactMode,
  updateOrCheckGeneratedArtifact,
} from "@/../scripts/generated-artifact.ts";

const descriptor = await resolveCommandDescriptor(buildMainCommand());
validateCommandDescriptor(descriptor);
const mode = parseGeneratedArtifactMode(process.argv.slice(2));
const artifacts = [
  {
    outputPath: join(import.meta.dir, "../../COMMANDS.md"),
    content: renderCommandReference(descriptor),
  },
  {
    outputPath: join(import.meta.dir, "../../cli-reference.json"),
    content: renderCommandReferenceJson(descriptor, VERSION),
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
