import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { CommandDef } from "citty";
import { defineOperationCommand } from "@/lib/operation-command.ts";
import { defineLocalCommand, defineOutputCommand } from "@/lib/operation-command-builders.ts";
import { localPlan, noopPlan, outputPlan } from "@/lib/operation-effect.ts";
import { CliError } from "@/lib/errors.ts";
import { formatInfoList } from "@/lib/info-list.ts";
import {
  formatTerminalMarkdownLinks,
  terminalAccent,
  terminalSubtle,
  terminalSuccess,
} from "@/ui/terminal/styles.ts";
import { buildCompletionSpec } from "@/lib/completion-spec.ts";
import {
  formatBashCompletion,
  formatFishCompletion,
  formatZshCompletion,
} from "@/lib/completion-format.ts";

type GetRootCommand = () => CommandDef;
type SupportedShell = "bash" | "zsh" | "fish";
type InstallTarget = {
  completionPath: string;
  rcPath?: string;
};
type InstallOptions = {
  updateRc?: boolean;
};
type InstallResult = {
  shell: SupportedShell;
  completionPath: string;
  rcPath?: string;
  rcUpdated: boolean;
  startupAction: "updated" | "skipped" | "not-needed";
};
type CompletionInstallInput = {
  explicitShell?: SupportedShell;
  updateRc: boolean;
};

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;
const START_MARKER = "# >>> altertable completion >>>";
const END_MARKER = "# <<< altertable completion <<<";
const COMPLETION_DOCS_URL = "https://github.com/altertable-ai/altertable-cli#shell-completion";

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

function envHome(): string {
  return process.env.HOME || homedir();
}

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(envHome(), ".local", "share");
}

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(envHome(), ".config");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function installTarget(shell: SupportedShell): InstallTarget {
  if (shell === "bash") {
    return {
      completionPath: join(xdgDataHome(), "bash-completion", "completions", "altertable"),
      rcPath: join(envHome(), ".bashrc"),
    };
  }

  if (shell === "zsh") {
    return {
      completionPath: join(xdgDataHome(), "zsh", "site-functions", "_altertable"),
      rcPath: join(envHome(), ".zshrc"),
    };
  }

  return {
    completionPath: join(xdgConfigHome(), "fish", "completions", "altertable.fish"),
  };
}

function managedBlock(body: string): string {
  return `${START_MARKER}\n${body.trimEnd()}\n${END_MARKER}\n`;
}

function rcBlock(shell: SupportedShell, target: InstallTarget): string | undefined {
  if (!target.rcPath) {
    return undefined;
  }

  if (shell === "bash") {
    return managedBlock(
      `if [ -f ${shellQuote(target.completionPath)} ]; then\n  . ${shellQuote(target.completionPath)}\nfi`,
    );
  }

  return managedBlock(
    `fpath=(${shellQuote(dirname(target.completionPath))} $fpath)\nautoload -Uz compinit\ncompinit`,
  );
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function upsertManagedBlock(existing: string, block: string): string {
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start).trimEnd();
    const after = existing.slice(end + END_MARKER.length).trimStart();
    return [before, block.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
  }

  const prefix = existing.trimEnd();
  if (!prefix) {
    return block;
  }
  return `${prefix}\n\n${block}`;
}

function formatCompletionScript(shell: SupportedShell, rootCommand: CommandDef): string {
  const spec = buildCompletionSpec(rootCommand);
  if (shell === "bash") {
    return formatBashCompletion(spec);
  }
  if (shell === "zsh") {
    return formatZshCompletion(spec);
  }
  return formatFishCompletion(spec);
}

export async function installCompletion(
  shell: SupportedShell,
  script: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const target = installTarget(shell);
  await mkdir(dirname(target.completionPath), { recursive: true });
  await writeFile(target.completionPath, `${script.trimEnd()}\n`, "utf8");

  const shouldUpdateRc = options.updateRc !== false;
  const block = shouldUpdateRc ? rcBlock(shell, target) : undefined;
  if (block && target.rcPath) {
    await mkdir(dirname(target.rcPath), { recursive: true });
    const existing = await readOptionalFile(target.rcPath);
    await writeFile(target.rcPath, upsertManagedBlock(existing, block), "utf8");
    return {
      shell,
      completionPath: target.completionPath,
      rcPath: target.rcPath,
      rcUpdated: true,
      startupAction: "updated",
    };
  }

  return {
    shell,
    completionPath: target.completionPath,
    rcPath: target.rcPath,
    rcUpdated: false,
    startupAction: target.rcPath ? "skipped" : "not-needed",
  };
}

function formatInstallMessage(result: InstallResult): string {
  const labelWidth = 8;
  const startup =
    result.startupAction === "updated"
      ? `updated ${terminalAccent(result.rcPath ?? "")}`
      : result.startupAction === "skipped"
        ? `left unchanged ${terminalSubtle("(--no-rc)")}`
        : "automatic";
  const next =
    result.startupAction === "skipped"
      ? "Add the completion script to your shell startup file, then open a new terminal."
      : "Open a new terminal, or reload your shell, to start using completion.";

  const lines = [
    `${terminalSuccess("✓")} Shell completion installed`,
    formatInfoList(
      [
        { label: "Shell", value: result.shell },
        { label: "Script", value: terminalAccent(result.completionPath) },
        { label: "Startup", value: startup },
        { label: "Next", value: next },
        {
          label: "Docs",
          value: formatTerminalMarkdownLinks(`[Shell completion](${COMPLETION_DOCS_URL})`),
        },
      ],
      { labelWidth, indent: "  " },
    ),
  ];
  return lines.join("\n");
}

function createShellCompletionCommand(
  shell: SupportedShell,
  getRootCommand: GetRootCommand,
): CommandDef {
  return defineOutputCommand({
    id: `completion.${shell}`,
    capabilities: ["raw-stdout"],
    output: "raw-api",
    meta: {
      name: shell,
      description: `Generate ${shell} completion script.`,
    },
    render() {
      return { kind: "raw_api", body: formatCompletionScript(shell, getRootCommand()) };
    },
  });
}

function createInstallShellCommand(
  shell: SupportedShell,
  getRootCommand: GetRootCommand,
): CommandDef {
  return defineLocalCommand({
    id: `completion.install.${shell}`,
    mutates: true,
    output: "human",
    meta: {
      name: shell,
      description: `Install ${shell} completion.`,
    },
    args: {
      "no-rc": {
        type: "boolean",
        description: "Write the completion file without updating shell startup files.",
      },
    },
    parse({ args, rawArgs }) {
      return {
        updateRc: args["no-rc"] !== true && !rawArgs.includes("--no-rc"),
      };
    },
    local(input) {
      const script = formatCompletionScript(shell, getRootCommand());
      return installCompletion(shell, script, input);
    },
    present(result, { sink }) {
      if (sink.json) {
        sink.writeJson(result);
        return;
      }
      sink.writeHuman(formatInstallMessage(result));
    },
  });
}

export function createCompletionCommand(getRootCommand: GetRootCommand): CommandDef {
  const installCommand = defineOperationCommand<CompletionInstallInput, InstallResult | undefined>({
    id: "completion.install",
    capabilities: ["local-file-write"],
    catalog: { effects: ["local", "value"], mutates: true, output: "human" },
    meta: {
      name: "install",
      description: "Install shell completion for the current shell.",
      examples: [
        "altertable completion install",
        "altertable completion install fish",
        "altertable completion install zsh --no-rc",
      ],
    },
    subCommands: {
      bash: createInstallShellCommand("bash", getRootCommand),
      fish: createInstallShellCommand("fish", getRootCommand),
      zsh: createInstallShellCommand("zsh", getRootCommand),
    },
    args: {
      "no-rc": {
        type: "boolean",
        description: "Write the completion file without updating shell startup files.",
      },
    },
    parse({ args, rawArgs }) {
      const explicitShell = rawArgs.slice(rawArgs.indexOf("install") + 1).find(isSupportedShell);
      return {
        explicitShell,
        updateRc: args["no-rc"] !== true && !rawArgs.includes("--no-rc"),
      };
    },
    run(input) {
      if (input.explicitShell) {
        return noopPlan<InstallResult | undefined>();
      }

      return localPlan(() => {
        const shell = resolveShell(undefined);
        const script = formatCompletionScript(shell, getRootCommand());
        return installCompletion(shell, script, {
          updateRc: input.updateRc,
        });
      });
    },
    present(result, { sink }) {
      if (result === undefined) {
        return;
      }
      if (sink.json) {
        sink.writeJson(result);
        return;
      }
      sink.writeHuman(formatInstallMessage(result));
    },
  });

  return defineOperationCommand({
    id: "completion",
    capabilities: ["raw-stdout"],
    catalog: { effects: ["output", "value"], output: "raw-api" },
    meta: {
      name: "completion",
      description: "Generate or install shell completion scripts.",
      examples: [
        "altertable completion install",
        "altertable completion install zsh",
        "altertable completion bash > ~/.local/share/bash-completion/completions/altertable",
      ],
    },
    subCommands: {
      bash: createShellCompletionCommand("bash", getRootCommand),
      fish: createShellCompletionCommand("fish", getRootCommand),
      install: installCommand,
      zsh: createShellCompletionCommand("zsh", getRootCommand),
    },
    parse({ rawArgs }) {
      return rawArgs;
    },
    run(rawArgs) {
      if (rawArgs.some((arg) => arg === "install" || isSupportedShell(arg))) {
        return noopPlan();
      }
      const shell = resolveShell(undefined);
      return outputPlan({ kind: "raw_api", body: formatCompletionScript(shell, getRootCommand()) });
    },
  });
}
