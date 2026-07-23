import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMainCommand } from "@/cli.ts";
import { resolveCommandDescriptor, validateCommandDescriptor } from "@/lib/command-descriptor.ts";
import { VERSION } from "@/version.ts";
import {
  buildCommandReference,
  renderCommandReferenceJson,
  renderCommandReferenceMarkdown,
} from "@/../scripts/command-reference.ts";

async function resolveReference() {
  const descriptor = await resolveCommandDescriptor(buildMainCommand());
  validateCommandDescriptor(descriptor);
  return buildCommandReference(descriptor, VERSION);
}

describe("command reference", () => {
  test("renders the canonical model into command documentation", async () => {
    const reference = renderCommandReferenceMarkdown(await resolveReference());

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
    expect(readFileSync(join(import.meta.dir, "../../COMMANDS.md"), "utf8")).toBe(reference);
  });

  test("serializes the same model into the versioned JSON contract", async () => {
    const reference = renderCommandReferenceJson(await resolveReference());
    const parsed = JSON.parse(reference);
    const upload = parsed.groups
      .find((group: { id: string }) => group.id === "ingest")
      .commands.find((command: { id: string }) => command.id === "altertable-upload");

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      cliVersion: VERSION,
      globalOptions: expect.arrayContaining([
        expect.objectContaining({ name: "help", aliases: ["h"], scope: "global" }),
      ]),
    });
    expect(upload).toMatchObject({
      command: "altertable upload",
      usage: ["altertable upload [options] <FILE>"],
      aliases: [],
      arguments: [expect.objectContaining({ name: "file", required: true })],
      subcommands: [],
    });
    expect(reference).not.toContain('"rootDescription"');
    expect(reference).not.toContain('"parserRequired"');
    expect(reference).not.toContain('"requiredExplicitly"');
    expect(reference).not.toContain('"rename"');
    expect(readFileSync(join(import.meta.dir, "../../cli-reference.json"), "utf8")).toBe(reference);
  });
});
