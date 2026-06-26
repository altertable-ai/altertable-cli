import { basename } from "node:path";
import type { CommandDef } from "citty";
import { CliError } from "@/lib/errors.ts";
import { buildCompletionSpec } from "@/lib/completion-spec.ts";
import {
  formatBashCompletion,
  formatFishCompletion,
  formatZshCompletion,
} from "@/lib/completion-format.ts";

type GetRootCommand = () => CommandDef;
type SupportedShell = "bash" | "zsh" | "fish";

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;

function isSupportedShell(shell: string): shell is SupportedShell {
  return SUPPORTED_SHELLS.includes(shell as SupportedShell);
}

function formatSupportedShells(): string {
  return SUPPORTED_SHELLS.join(", ");
}

function getShellName(shellPath: string): string {
  return basename(shellPath).toLowerCase();
}

function resolveShell(shell: unknown): SupportedShell {
  if (typeof shell === "string" && shell.length > 0) {
    const explicitShell = getShellName(shell);
    if (isSupportedShell(explicitShell)) {
      return explicitShell;
    }
    throw new CliError(`Unsupported shell: ${shell}. Use ${formatSupportedShells()}.`);
  }

  const detectedShell = process.env.SHELL ? getShellName(process.env.SHELL) : "";
  if (isSupportedShell(detectedShell)) {
    return detectedShell;
  }

  throw new CliError(
    `Could not detect a supported shell. Pass one of: ${formatSupportedShells()}.`,
  );
}

export function createCompletionCommand(getRootCommand: GetRootCommand): CommandDef {
  return {
    meta: {
      name: "completion",
      description: "Generate shell completion scripts.",
    },
    args: {
      shell: {
        type: "string",
        description: "Shell: bash, zsh, or fish. Defaults to the current shell.",
      },
    },
    async run({ args }) {
      const shell = resolveShell(args.shell);
      const spec = buildCompletionSpec(getRootCommand());

      if (shell === "bash") {
        console.log(formatBashCompletion(spec));
        return;
      }
      if (shell === "zsh") {
        console.log(formatZshCompletion(spec));
        return;
      }
      console.log(formatFishCompletion(spec));
    },
  };
}
