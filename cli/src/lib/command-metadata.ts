import type { AltertableCommandGroup, AltertableCommandMeta, Command } from "@/lib/command.ts";

export type CommandMetadata = {
  name?: string;
  description: string;
  aliases: string[];
  examples: string[];
  hidden: boolean;
  commandGroup?: AltertableCommandGroup;
};

function toStrings(value: string | string[] | readonly string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

export function normalizeCommandMetadata(
  metadata: AltertableCommandMeta | undefined,
): CommandMetadata {
  return {
    ...(metadata?.name ? { name: String(metadata.name) } : {}),
    description: metadata?.description ?? "",
    aliases: toStrings(metadata?.alias),
    examples: toStrings(metadata?.examples),
    hidden: metadata?.hidden === true,
    ...(metadata?.commandGroup ? { commandGroup: metadata.commandGroup } : {}),
  };
}

export async function resolveCommandMetadata(command: Command): Promise<CommandMetadata> {
  const source = command.meta;
  const metadata =
    typeof source === "function"
      ? await source()
      : await (source ?? Promise.resolve<AltertableCommandMeta | undefined>(undefined));
  return normalizeCommandMetadata(metadata as AltertableCommandMeta | undefined);
}

export function readCommandMetadata(command: Command): CommandMetadata {
  const source = command.meta;
  if (typeof source === "function" || (source && typeof source === "object" && "then" in source)) {
    throw new TypeError("Command metadata must be static for synchronous consumers.");
  }
  return normalizeCommandMetadata(source as AltertableCommandMeta | undefined);
}
