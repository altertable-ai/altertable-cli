import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { CommandDef } from "citty";
import { defineCommand } from "@/lib/command-context.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { CliError } from "@/lib/errors.ts";
import {
  defaultConfigurePrompts,
  type ConfigurePrompts,
} from "@/lib/profile-configure-interactive.ts";
import { document, rows, section, span, text, type DisplayText } from "@/ui/document.ts";
import { renderDocumentText } from "@/ui/renderers/terminal.ts";
import { buildCompletionSpec } from "@/lib/completion-spec.ts";
import { readEnv } from "@/lib/env.ts";
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
type CompletionRootInput =
  | {
      kind: "help";
    }
  | {
      kind: "install";
      shell?: SupportedShell;
      updateRc: boolean;
    };
type CompletionCommandOptions = {
  prompts?: ConfigurePrompts;
};
type CompletionPromptChoice = "install" | "install-bash" | "install-zsh" | "install-fish" | "help";

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;
const START_MARKER = "# >>> altertable completion >>>";
const END_MARKER = "# <<< altertable completion <<<";
const COMPLETION_DOCS_URL = "https://github.com/altertable-ai/altertable-cli#shell-completion";
const COMPLETION_GUIDANCE = {
  install: "altertable completion install",
  installShell: "altertable completion install zsh",
  manual: "altertable completion generate zsh",
  docs: COMPLETION_DOCS_URL,
};

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

  const envShell = readEnv("SHELL");
  const detectedShell = envShell ? getShellName(envShell) : "";
  if (isSupportedShell(detectedShell)) {
    return detectedShell;
  }

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
          {
            label: "Docs:",
            value: [span("Shell completion", "accent", COMPLETION_DOCS_URL)],
          },
        ]),
      ),
    ),
    { labelWidth: "Startup:".length },
  );
}

function formatCompletionHelpMessage(): string {
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

async function promptCompletionInput(prompts: ConfigurePrompts): Promise<CompletionRootInput> {
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

  switch (selected) {
    case "install":
      return { kind: "install", updateRc: true };
    case "install-bash":
      return { kind: "install", shell: "bash", updateRc: true };
    case "install-zsh":
      return { kind: "install", shell: "zsh", updateRc: true };
    case "install-fish":
      return { kind: "install", shell: "fish", updateRc: true };
    case "help":
      return { kind: "help" };
  }
}

function createShellCompletionCommand(
  shell: SupportedShell,
  getRootCommand: GetRootCommand,
): CommandDef {
  return defineCommand({
    meta: {
      name: shell,
      description: `Generate ${shell} completion script.`,
    },
    async run({ sink }) {
      await writeCommandOutput(
        { kind: "raw_api", body: formatCompletionScript(shell, getRootCommand()) },
        sink,
      );
    },
  });
}

function createInstallShellCommand(
  shell: SupportedShell,
  getRootCommand: GetRootCommand,
): CommandDef {
  return defineCommand({
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
    async run({ args, rawArgs, sink }) {
      const script = formatCompletionScript(shell, getRootCommand());
      const result = await installCompletion(shell, script, {
        updateRc: args["no-rc"] !== true && !rawArgs.includes("--no-rc"),
      });
      if (sink.json) {
        sink.writeJson(result);
        return;
      }
      sink.writeHuman(formatInstallMessage(result));
    },
  });
}

function createGenerateCommand(getRootCommand: GetRootCommand): CommandDef {
  return defineCommand({
    meta: {
      name: "generate",
      description: "Generate a shell completion script.",
      examples: [
        "altertable completion generate bash",
        "altertable completion generate zsh > ~/.local/share/zsh/site-functions/_altertable",
      ],
    },
    subCommands: {
      bash: createShellCompletionCommand("bash", getRootCommand),
      fish: createShellCompletionCommand("fish", getRootCommand),
      zsh: createShellCompletionCommand("zsh", getRootCommand),
    },
  });
}

export function createCompletionCommand(
  getRootCommand: GetRootCommand,
  options: CompletionCommandOptions = {},
): CommandDef {
  const prompts = options.prompts ?? defaultConfigurePrompts;
  const installCommand = defineCommand({
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
    async run({ args, rawArgs, sink }) {
      const explicitShell = rawArgs.slice(rawArgs.indexOf("install") + 1).find(isSupportedShell);
      if (explicitShell) return;
      const shell = resolveShell(undefined);
      const script = formatCompletionScript(shell, getRootCommand());
      const result = await installCompletion(shell, script, {
        updateRc: args["no-rc"] !== true && !rawArgs.includes("--no-rc"),
      });
      if (sink.json) {
        sink.writeJson(result);
        return;
      }
      sink.writeHuman(formatInstallMessage(result));
    },
  });

  return defineCommand({
    meta: {
      name: "completion",
      commandGroup: "platform",
      description: "Generate or install shell completion scripts.",
      examples: [
        "altertable completion install",
        "altertable completion install zsh",
        "altertable completion generate bash > ~/.local/share/bash-completion/completions/altertable",
      ],
    },
    subCommands: {
      bash: createShellCompletionCommand("bash", getRootCommand),
      fish: createShellCompletionCommand("fish", getRootCommand),
      generate: createGenerateCommand(getRootCommand),
      install: installCommand,
      zsh: createShellCompletionCommand("zsh", getRootCommand),
    },
    async run({ rawArgs, runtime, sink }) {
      if (rawArgs.some((arg) => arg === "install" || arg === "generate" || isSupportedShell(arg))) {
        return;
      }

      let action: CompletionRootInput;
      if (process.stdin.isTTY === true && !runtime.context.agent && !sink.json) {
        action = await promptCompletionInput(prompts);
      } else {
        action = { kind: "help" };
      }

      if (action.kind === "help") {
        if (sink.json) sink.writeJson(COMPLETION_GUIDANCE);
        else sink.writeHuman(formatCompletionHelpMessage());
      } else {
        const shell = action.shell ?? resolveShell(undefined);
        const script = formatCompletionScript(shell, getRootCommand());
        const result = await installCompletion(shell, script, {
          updateRc: action.updateRc,
        });
        if (sink.json) sink.writeJson(result);
        else sink.writeHuman(formatInstallMessage(result));
      }
    },
  });
}
