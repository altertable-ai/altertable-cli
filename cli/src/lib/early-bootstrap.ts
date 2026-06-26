export const HELP_FLAGS = ["--help", "-h"] as const;
export const VERSION_FLAGS = ["--version", "-v"] as const;

export type EarlyBootstrapExitId = "help" | "version";

export type EarlyBootstrapExit = {
  id: EarlyBootstrapExitId;
  flags: readonly string[];
  matches(rawArgs: readonly string[]): boolean;
};

function argvIncludesFlag(rawArgs: readonly string[], flags: readonly string[]): boolean {
  return rawArgs.some((arg) => flags.includes(arg));
}

export const EARLY_BOOTSTRAP_EXITS: readonly EarlyBootstrapExit[] = [
  {
    id: "help",
    flags: HELP_FLAGS,
    matches(rawArgs) {
      return rawArgs.length === 0 || argvIncludesFlag(rawArgs, HELP_FLAGS);
    },
  },
  {
    id: "version",
    flags: VERSION_FLAGS,
    matches(rawArgs) {
      return (
        rawArgs.length === 1 && VERSION_FLAGS.includes(rawArgs[0] as (typeof VERSION_FLAGS)[number])
      );
    },
  },
];

export function findEarlyBootstrapExit(rawArgs: readonly string[]): EarlyBootstrapExit | undefined {
  return EARLY_BOOTSTRAP_EXITS.find((exit) => exit.matches(rawArgs));
}
