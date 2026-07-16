import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Command } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import { readEnv } from "@/lib/env.ts";
import type { ConfigurePrompts } from "@/lib/profile-configure-interactive.ts";
import { document, rows, section, span, text, type DisplayText } from "@/ui/document.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";
import { buildCompletionSpec } from "@/commands/completion/lib/spec.ts";
import {
  formatBashCompletion,
  formatFishCompletion,
  formatZshCompletion,
} from "@/commands/completion/lib/format.ts";

export type GetRootCommand = () => Command;
export type SupportedShell = "bash" | "zsh" | "fish";
export type CompletionRootInput =
  | { kind: "help" }
  | { kind: "install"; shell?: SupportedShell; updateRc: boolean };
export type CompletionCommandOptions = { prompts?: ConfigurePrompts };
export type InstallResult = {
  shell: SupportedShell;
  completionPath: string;
  rcPath?: string;
  rcUpdated: boolean;
  startupAction: "updated" | "skipped" | "not-needed";
};

type InstallTarget = { completionPath: string; rcPath?: string };
type InstallOptions = { updateRc?: boolean };
type CompletionPromptChoice = "install" | "install-bash" | "install-zsh" | "install-fish" | "help";

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;
const START_MARKER = "# >>> altertable completion >>>";
const END_MARKER = "# <<< altertable completion <<<";
const COMPLETION_DOCS_URL = "https://github.com/altertable-ai/altertable-cli#shell-completion";
export const COMPLETION_GUIDANCE = {
  install: "altertable completion install",
  installShell: "altertable completion install zsh",
  manual: "altertable completion generate zsh",
  docs: COMPLETION_DOCS_URL,
};

export function isSupportedShell(shell: string): shell is SupportedShell {
  return SUPPORTED_SHELLS.includes(shell as SupportedShell);
}

function formatSupportedShells(): string {
  return SUPPORTED_SHELLS.join(", ");
}

function getShellName(shellPath: string): string {
  return basename(shellPath).toLowerCase();
}

export function resolveShell(shell: unknown): SupportedShell {
  if (typeof shell === "string" && shell.length > 0) {
    const explicitShell = getShellName(shell);
    if (isSupportedShell(explicitShell)) return explicitShell;
    throw new CliError(`Unsupported shell: ${shell}. Use ${formatSupportedShells()}.`);
  }

  const envShell = readEnv("SHELL");
  const detectedShell = envShell ? getShellName(envShell) : "";
  if (isSupportedShell(detectedShell)) return detectedShell;
  throw new CliError(
    `Could not detect a supported shell. Pass one of: ${formatSupportedShells()}.`,
  );
}

function envHome(): string {
  return readEnv("HOME") ?? homedir();
}

function xdgDataHome(): string {
  return readEnv("XDG_DATA_HOME") ?? join(envHome(), ".local", "share");
}

function xdgConfigHome(): string {
  return readEnv("XDG_CONFIG_HOME") ?? join(envHome(), ".config");
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
  if (!target.rcPath) return undefined;
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
  return prefix ? `${prefix}\n\n${block}` : block;
}

export function formatCompletionScript(shell: SupportedShell, rootCommand: Command): string {
  const spec = buildCompletionSpec(rootCommand);
  if (shell === "bash") return formatBashCompletion(spec);
  if (shell === "zsh") return formatZshCompletion(spec);
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

  const block = options.updateRc === false ? undefined : rcBlock(shell, target);
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

export function formatInstallMessage(result: InstallResult): string {
  const startup: DisplayText =
    result.startupAction === "updated"
      ? [span("updated "), span(result.rcPath ?? "", "accent")]
      : result.startupAction === "skipped"
        ? [span("left unchanged "), span("(--no-rc)", "subtle")]
        : "automatic";
  const next =
    result.startupAction === "skipped"
      ? "Add the completion script to your shell startup file, then open a new terminal."
      : "Open a new terminal, or reload your shell, to start using completion.";

  return renderDocumentText(
    document(
      section(
        text([[span("✓", "success"), span(" Shell completion installed")]]),
        rows([
          { label: "Shell:", value: result.shell },
          { label: "Script:", value: [span(result.completionPath, "accent")] },
          { label: "Startup:", value: startup },
          { label: "Next:", value: next },
          { label: "Docs:", value: [span("Shell completion", "accent", COMPLETION_DOCS_URL)] },
        ]),
      ),
    ),
    { labelWidth: "Startup:".length },
  );
}

export function formatCompletionHelpMessage(): string {
  return renderDocumentText(
    document(
      section(
        text([[span("Shell completion", "accent")]]),
        rows([
          { label: "Install:", value: COMPLETION_GUIDANCE.install },
          { label: "Install shell:", value: COMPLETION_GUIDANCE.installShell },
          { label: "Manual:", value: COMPLETION_GUIDANCE.manual },
          {
            label: "Docs:",
            value: [span("Shell completion", "accent", COMPLETION_GUIDANCE.docs)],
          },
        ]),
      ),
    ),
    { labelWidth: "Install shell:".length },
  );
}

export async function promptCompletionInput(
  prompts: ConfigurePrompts,
): Promise<CompletionRootInput> {
  const selected = (await prompts.readSelect(
    "Shell completion",
    [
      { value: "install", label: "Install for current shell" },
      { value: "install-bash", label: "Install for bash" },
      { value: "install-zsh", label: "Install for zsh" },
      { value: "install-fish", label: "Install for fish" },
      { value: "help", label: "Show manual install commands" },
    ],
    "install",
    { leadingNewline: false },
  )) as CompletionPromptChoice;

  if (selected === "install") return { kind: "install", updateRc: true };
  if (selected === "install-bash") return { kind: "install", shell: "bash", updateRc: true };
  if (selected === "install-zsh") return { kind: "install", shell: "zsh", updateRc: true };
  if (selected === "install-fish") return { kind: "install", shell: "fish", updateRc: true };
  return { kind: "help" };
}
