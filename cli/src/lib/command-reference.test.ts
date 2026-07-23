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

    expect(reference).toContain(
      "```bash\naltertable query [options] <STATEMENT>\naltertable query show|cancel\n```",
    );
    expect(reference).toContain("```bash\naltertable profile env [NAME]\n```");
    expect(reference).toContain("```bash\naltertable completion generate <BASH|FISH|ZSH>\n```");
    expect(reference).toContain("```bash\naltertable catalogs create <NAME>\n```");
    expect(reference).toContain("`-h, --help`");
    expect(reference).toContain("`-v, --version`");
    expect(reference).toContain("`--to <TO>` | Destination as catalog.schema.table Required.");
    expect(reference).toContain(
      "`-f, --raw-field <RAW-FIELD>` | String request parameter key=value (repeatable; gh api -f semantics) Repeatable.",
    );
    expect(reference).not.toContain("altertable profile rename");
    expect(readFileSync(join(import.meta.dir, "../../../COMMANDS.md"), "utf8")).toBe(reference);
  });
});
