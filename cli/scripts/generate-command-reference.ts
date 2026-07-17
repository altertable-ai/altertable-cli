import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { resolveCommandDescriptor, validateCommandDescriptor } from "@/lib/command-descriptor.ts";
import { renderCommandReference } from "@/lib/command-reference.ts";

const outputPath = join(import.meta.dir, "../../COMMANDS.md");
const descriptor = await resolveCommandDescriptor(buildMainCommand());
validateCommandDescriptor(descriptor);
writeFileSync(outputPath, renderCommandReference(descriptor));
console.log(`Wrote ${outputPath}`);
