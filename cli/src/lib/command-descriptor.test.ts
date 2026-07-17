import { describe, expect, test } from "bun:test";
import { buildMainCommand } from "@/cli.ts";
import { buildCompletionSpecFromDescriptor } from "@/commands/completion/lib/spec.ts";
import { defineCommand } from "@/lib/command.ts";
import {
  resolveCommandDescriptor,
  resolveCommandMetadata,
  validateCommandDescriptor,
  visibleCommandDescriptors,
  type CommandArgumentDescriptor,
  type CommandDescriptor,
  type CommandMetadata,
} from "@/lib/command-descriptor.ts";
import {
  buildStructuredHelpFromDescriptor,
  renderAltertableUsageFromDescriptor,
} from "@/lib/usage.ts";

function structuredArgumentContract(argument: CommandArgumentDescriptor) {
  return {
    name: argument.name,
    aliases: argument.aliases,
    type: argument.type,
    required: argument.required,
    description: argument.description,
    ...(argument.default !== undefined ? { default: argument.default } : {}),
    ...(argument.values.length > 0 ? { values: argument.values } : {}),
  };
}

function completionContract(
  descriptor: CommandDescriptor,
  name: string,
  depth = 0,
): ReturnType<typeof buildCompletionSpecFromDescriptor> {
  const subcommands =
    depth >= 3
      ? []
      : visibleCommandDescriptors(descriptor.subcommands)
          .flatMap((child) => {
            if (!child.metadata.name) return [];
            return [...new Set([child.metadata.name, ...child.metadata.aliases])].map((childName) =>
              completionContract(child, childName, depth + 1),
            );
          })
          .sort((left, right) => left.name.localeCompare(right.name));

  return {
    name,
    description: descriptor.metadata.description || undefined,
    subcommands,
    flags: descriptor.arguments
      .filter((argument) => ["boolean", "string", "enum"].includes(argument.type))
      .map((argument) => ({
        name: argument.name,
        alias: argument.aliases[0],
        description: argument.description || undefined,
        values: argument.values.length > 0 ? argument.values : undefined,
        takesValue: argument.type === "string" || argument.type === "enum",
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    positionals: descriptor.arguments
      .filter((argument) => argument.type === "positional")
      .map((argument) => ({
        name: argument.name,
        description: argument.description || undefined,
        required: argument.required,
        completion: argument.positionalCompletion ?? "freeform",
        values: argument.values,
      })),
  };
}

async function expectStructuredHelpMatchesDescriptor(
  descriptor: CommandDescriptor,
  root: CommandDescriptor,
  parent?: CommandDescriptor,
): Promise<void> {
  const help = buildStructuredHelpFromDescriptor(descriptor, parent, root);
  const humanHelp = renderAltertableUsageFromDescriptor(descriptor, parent);
  const compactHumanHelp = humanHelp.replace(/\s+/g, "");
  const arguments_ = descriptor.arguments.map(structuredArgumentContract);
  const visibleSubcommands = visibleCommandDescriptors(descriptor.subcommands);

  expect(help).toMatchObject({
    description: descriptor.metadata.description,
    aliases: descriptor.metadata.aliases,
    examples: descriptor.metadata.examples,
    arguments: arguments_.filter((argument) => argument.type === "positional"),
    options: parent ? arguments_.filter((argument) => argument.type !== "positional") : [],
    global_options: root.arguments.map(structuredArgumentContract),
    subcommands: visibleSubcommands.map((child) => ({
      name: child.key ?? child.metadata.name ?? "command",
      aliases: child.metadata.aliases,
      description: child.metadata.description,
    })),
  });

  for (const argument of descriptor.arguments) {
    if (argument.type === "positional") {
      const values =
        argument.values.length > 0 ? argument.values : [argument.valueHint ?? argument.name];
      for (const value of values) {
        expect(humanHelp).toContain(value.toUpperCase());
      }
    } else {
      expect(humanHelp).toContain(`--${argument.name}`);
    }
  }
  for (const child of visibleSubcommands) {
    if (parent || child.metadata.commandGroup) {
      expect(humanHelp).toContain(child.key ?? child.metadata.name ?? "command");
    }
  }
  for (const example of descriptor.metadata.examples) {
    expect(compactHumanHelp).toContain(example.replace(/\s+/g, ""));
  }

  for (const child of visibleSubcommands) {
    await expectStructuredHelpMatchesDescriptor(child, root, descriptor);
  }
}

describe("command descriptor", () => {
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
  });

  test("normalizes metadata, arguments, and child commands together", async () => {
    const command = defineCommand({
      meta: async () => ({ name: "completion", description: "Manage completion." }),
      args: {
        shell: {
          type: "positional",
          description: "Shell name",
          values: ["bash", "fish", "zsh"],
          required: true,
        },
        output: {
          type: "enum",
          alias: ["o"],
          description: "Output mode",
          options: ["script", "path"],
          default: "script",
        },
      },
      subCommands: {
        install: defineCommand({
          meta: async () => ({ name: "install", alias: "add" }),
        }),
      },
    });

    const descriptor = await resolveCommandDescriptor(command);

    expect(descriptor.metadata).toMatchObject({
      name: "completion",
      description: "Manage completion.",
    });
    expect(descriptor.arguments).toEqual([
      {
        name: "shell",
        aliases: [],
        type: "positional",
        description: "Shell name",
        required: true,
        requiredExplicitly: true,
        values: ["bash", "fish", "zsh"],
        positionalCompletion: "finite",
      },
      {
        name: "output",
        aliases: ["o"],
        type: "enum",
        description: "Output mode",
        required: false,
        requiredExplicitly: true,
        values: ["script", "path"],
        default: "script",
      },
    ]);
    expect(descriptor.subcommands).toHaveLength(1);
    expect(descriptor.subcommands[0]).toMatchObject({
      key: "install",
      metadata: { name: "install", aliases: ["add"] },
      arguments: [],
      subcommands: [],
    });
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  test("keeps human help, structured help, and completion aligned with the descriptor", async () => {
    const root = await resolveCommandDescriptor(buildMainCommand());

    expect(() => validateCommandDescriptor(root)).not.toThrow();
    await expectStructuredHelpMatchesDescriptor(root, root);
    expect(buildCompletionSpecFromDescriptor(root)).toEqual(
      completionContract(root, root.metadata.name ?? "altertable"),
    );
  });

  test("marks profile env name as an optional runtime operand", async () => {
    const root = await resolveCommandDescriptor(buildMainCommand());
    const profile = root.subcommands.find((command) => command.key === "profile");
    const env = profile?.subcommands.find((command) => command.key === "env");

    expect(env?.arguments).toEqual([
      expect.objectContaining({ name: "name", required: false, requiredExplicitly: true }),
    ]);
    expect(renderAltertableUsageFromDescriptor(env!, profile)).toContain("[NAME]");
    expect(buildStructuredHelpFromDescriptor(env!, profile, root).arguments).toEqual([
      expect.objectContaining({ name: "name", required: false }),
    ]);
  });

  test("reports descriptor invariant violations together", async () => {
    const descriptor = await resolveCommandDescriptor(
      defineCommand({
        meta: { name: "altertable" },
        subCommands: {
          registered: defineCommand({
            meta: { name: "canonical" },
            args: {
              value: { type: "positional", description: "Runtime-optional value" },
            },
          }),
        },
      }),
    );

    expect(() => validateCommandDescriptor(descriptor)).toThrow(
      /registry key "registered" must match canonical name "canonical"/,
    );
    expect(() => validateCommandDescriptor(descriptor)).toThrow(
      /visible root command must declare a help group/,
    );
    expect(() => validateCommandDescriptor(descriptor)).toThrow(
      /positional requiredness must be explicit/,
    );
  });
});
