import { describe, expect, test } from "bun:test";
import { defineCommand } from "@/lib/command.ts";
import {
  readCommandMetadata,
  resolveCommandMetadata,
  type CommandMetadata,
} from "@/lib/command-metadata.ts";

describe("command metadata", () => {
  test("normalizes the shared command presentation contract", async () => {
    const command = defineCommand({
      meta: {
        name: "inspect",
        alias: ["show", "get"],
        description: "Inspect a resource.",
        examples: ["altertable inspect resource"],
        hidden: true,
        commandGroup: "platform",
      },
    });

    const expected = {
      name: "inspect",
      aliases: ["show", "get"],
      description: "Inspect a resource.",
      examples: ["altertable inspect resource"],
      hidden: true,
      commandGroup: "platform",
    } satisfies CommandMetadata;
    expect(readCommandMetadata(command)).toEqual(expected);
    expect(await resolveCommandMetadata(command)).toEqual(expected);
  });

  test("supports resolvable metadata for asynchronous consumers", async () => {
    const command = defineCommand({
      meta: async () => ({ name: "generated", description: "Generated metadata." }),
    });

    expect(await resolveCommandMetadata(command)).toMatchObject({
      name: "generated",
      description: "Generated metadata.",
    });
    expect(() => readCommandMetadata(command)).toThrow("must be static");
  });
});
