import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { resolveCommandDescriptor, validateCommandDescriptor } from "@/lib/command-descriptor.ts";
import { renderCommandReference } from "@/lib/command-reference.ts";
import {
  parseGeneratedArtifactMode,
  updateOrCheckGeneratedArtifact,
} from "@/../scripts/generated-artifact.ts";

const outputPath = join(import.meta.dir, "../../COMMANDS.md");
const descriptor = await resolveCommandDescriptor(buildMainCommand());
validateCommandDescriptor(descriptor);
const mode = parseGeneratedArtifactMode(process.argv.slice(2));
updateOrCheckGeneratedArtifact({
  outputPath,
  content: renderCommandReference(descriptor),
  mode,
  generateCommand: "bun run generate:commands",
});
console.log(`${mode === "check" ? "Checked" : "Wrote"} ${outputPath}`);
