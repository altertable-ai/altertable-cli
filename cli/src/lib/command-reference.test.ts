import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { resolveCommandDescriptor, validateCommandDescriptor } from "@/lib/command-descriptor.ts";
import { renderCommandReference } from "@/lib/command-reference.ts";

describe("command reference", () => {
  test("renders the validated descriptor into canonical command documentation", async () => {
    const descriptor = await resolveCommandDescriptor(buildMainCommand());
    validateCommandDescriptor(descriptor);

    const reference = renderCommandReference(descriptor);

    expect(reference).toContain("`altertable query [options] [STATEMENT]`");
    expect(reference).toContain("`altertable profile env [NAME]`");
    expect(reference).toContain("`altertable completion generate <BASH|FISH|ZSH>`");
    expect(reference).toContain("`altertable catalogs create <NAME>`");
    expect(reference).toContain("`-h, --help`");
    expect(reference).toContain("`-v, --version`");
    expect(reference).not.toContain("altertable profile rename");
    expect(readFileSync(join(import.meta.dir, "../../../COMMANDS.md"), "utf8")).toBe(reference);
  });
});
