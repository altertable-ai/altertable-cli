import type {
  CompletionContext,
  CompletionFlag,
  CompletionNode,
} from "@/commands/completion/lib/spec.ts";
import { collectCompletionContexts } from "@/commands/completion/lib/spec.ts";

const FISH_BINARY_NAME = "altertable";

export function groupCompletionContextsByTopLevel(
  contexts: readonly CompletionContext[],
): Map<string, CompletionContext[]> {
  const contextsByTopLevel = new Map<string, CompletionContext[]>();

  for (const context of contexts) {
    const topLevel = context.segments[0];
    if (!topLevel) {
      continue;
    }

    const group = contextsByTopLevel.get(topLevel) ?? [];
    group.push(context);
    contextsByTopLevel.set(topLevel, group);
  }

  return contextsByTopLevel;
}

function completionWordIndex(segmentCount: number): number {
  return segmentCount + 1;
}

export function mergeCompletionFlags(
  nodeFlags: readonly CompletionFlag[],
  rootFlags: readonly CompletionFlag[],
): CompletionFlag[] {
  return [...nodeFlags, ...rootFlags];
}

function formatSubcommandNameList(names: readonly string[]): string {
  return names.join(" ");
}

function formatSubcommandNodeList(subcommands: readonly CompletionNode[]): string {
  return formatSubcommandNameList(subcommands.map((node) => node.name));
}

function formatContextVariableName(segments: readonly string[]): string {
  return segments.join("_").replace(/-/g, "_");
}

export function formatBashFlagWordList(flags: readonly CompletionFlag[]): string {
  const parts: string[] = [];
  for (const flag of flags) {
    if (flag.alias) {
      parts.push(`-${flag.alias}`, `--${flag.name}`);
    } else {
      parts.push(`--${flag.name}`);
    }
  }
  return parts.join(" ");
}

function formatBashFlagValueSpecList(flags: readonly CompletionFlag[]): string {
  return flags
    .filter((flag) => flag.values && flag.values.length > 0)
    .map((flag) => {
      const flagNames = flag.alias ? `--${flag.name}|-${flag.alias}` : `--${flag.name}`;
      return `"${flagNames}=${flag.values?.join(",")}"`;
    })
    .join(" ");
}

function formatBashPathMatch(segments: readonly string[]): string {
  return segments
    .map((segment, index) => `"$\{COMP_WORDS[${index + 1}]}" == "${segment}"`)
    .join(" && ");
}

function formatZshPathMatch(segments: readonly string[]): string {
  return segments.map((segment, index) => `$words[${index + 1}] == ${segment}`).join(" && ");
}

function formatZshFlagArgumentLines(flags: readonly CompletionFlag[]): string {
  return flags
    .map((flag) => {
      const description = flag.description ? `[${flag.description}]` : "";
      const values =
        flag.values && flag.values.length > 0 ? `:${flag.name}:(${flag.values.join(" ")})` : "";
      if (flag.alias) {
        return `          '(-${flag.alias} --${flag.name})'{-${flag.alias},--${flag.name}}'${description}${values}'`;
      }
      return `          '--${flag.name}[${flag.description ?? flag.name}]${values}'`;
    })
    .join(" \\\n");
}

function escapeFishDescription(description: string): string {
  return description.replace(/'/g, "\\'");
}

export function formatFishPathCondition(
  segments: readonly string[],
  subcommands: readonly string[],
): string {
  const conditions = segments.map((segment) => `__fish_seen_subcommand_from ${segment}`);

  if (subcommands.length > 0) {
    conditions.push(`not __fish_seen_subcommand_from ${subcommands.join(" ")}`);
  }

  return conditions.join("; and ");
}

function formatFishFlagCompleteLine(
  flag: CompletionFlag,
  options?: {
    condition?: string;
  },
): string {
  const shortFlag = flag.alias ? ` -s ${flag.alias}` : "";
  const description = flag.description ? ` -d '${escapeFishDescription(flag.description)}'` : "";
  const values =
    flag.values && flag.values.length > 0 ? ` -f -r -a "${flag.values.join(" ")}"` : "";
  const condition = options?.condition ? ` -n "${options.condition}"` : "";
  return `complete -c ${FISH_BINARY_NAME}${shortFlag} -l ${flag.name}${description}${values}${condition}`;
}

function joinBashWordList(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(" ");
}

function formatBashContextBlock(
  context: CompletionContext,
  rootFlags: readonly CompletionFlag[],
): string | undefined {
  const wordIndex = completionWordIndex(context.segments.length);
  const pathMatch = formatBashPathMatch(context.segments);
  const nodeFlagWordList = formatBashFlagWordList(context.flags);
  const rootFlagWordList = formatBashFlagWordList(rootFlags);
  const flagValueSpecList = formatBashFlagValueSpecList(
    mergeCompletionFlags(context.flags, rootFlags),
  );
  const flagValueBlock =
    flagValueSpecList.length > 0
      ? `      if [[ ${pathMatch} ]] && _altertable_complete_flag_value ${flagValueSpecList}; then
        return
      fi
`
      : "";

  if (context.subcommands.length > 0) {
    const wordList = joinBashWordList([
      formatSubcommandNameList(context.subcommands),
      nodeFlagWordList,
      rootFlagWordList,
    ]);
    return `${flagValueBlock}      if [[ \${COMP_CWORD} -eq ${wordIndex} && ${pathMatch} ]]; then
        COMPREPLY=( $(compgen -W "${wordList}" -- "\${currentWord}") )
        return
      fi`;
  }

  if (context.flags.length === 0) {
    return undefined;
  }

  const wordList = joinBashWordList([nodeFlagWordList, rootFlagWordList]);
  return `${flagValueBlock}      if [[ \${COMP_CWORD} -ge ${wordIndex} && ${pathMatch} ]]; then
        COMPREPLY=( $(compgen -W "${wordList}" -- "\${currentWord}") )
        return
      fi`;
}

function formatBashNestedCases(
  contexts: readonly CompletionContext[],
  rootFlags: readonly CompletionFlag[],
): string {
  return [...groupCompletionContextsByTopLevel(contexts).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topLevel, topContexts]) => {
      const blocks = topContexts
        .map((context) => formatBashContextBlock(context, rootFlags))
        .filter((block): block is string => block !== undefined)
        .join("\n");

      if (blocks.length === 0) {
        return undefined;
      }

      return `    ${topLevel})\n${blocks}\n      ;;`;
    })
    .filter((entry): entry is string => entry !== undefined)
    .join("\n");
}

export function formatBashCompletion(spec: CompletionNode): string {
  const topLevelCommands = formatSubcommandNodeList(spec.subcommands);
  const rootFlagWordList = formatBashFlagWordList(spec.flags);
  const rootFlagValueSpecList = formatBashFlagValueSpecList(spec.flags);
  const rootFlagValueBlock =
    rootFlagValueSpecList.length > 0
      ? `  if _altertable_complete_flag_value ${rootFlagValueSpecList}; then
    return
  fi

`
      : "";
  const nestedCases = formatBashNestedCases(collectCompletionContexts(spec), spec.flags);

  return `# altertable bash completion
# Preferred install: altertable completion install bash
# Manual install: altertable completion generate bash > ~/.local/share/bash-completion/completions/altertable

_altertable_complete_flag_value() {
  local previousWord="\${COMP_WORDS[COMP_CWORD - 1]}"
  local spec flagNames values flagName valuePrefix completions completion
  local -a flagNamesArray

  for spec in "$@"; do
    flagNames="\${spec%%=*}"
    values="\${spec#*=}"
    IFS="|" read -ra flagNamesArray <<< "\${flagNames}"

    for flagName in "\${flagNamesArray[@]}"; do
      if [[ "\${previousWord}" == "\${flagName}" ]]; then
        COMPREPLY=( $(compgen -W "\${values//,/ }" -- "\${currentWord}") )
        return 0
      fi

      if [[ "\${currentWord}" == "\${flagName}="* ]]; then
        valuePrefix="\${currentWord#"\${flagName}="}"
        completions=( $(compgen -W "\${values//,/ }" -- "\${valuePrefix}") )
        COMPREPLY=()
        for completion in "\${completions[@]}"; do
          COMPREPLY+=( "\${flagName}=\${completion}" )
        done
        return 0
      fi
    done
  done

  return 1
}

_altertable_completions() {
  local currentWord="\${COMP_WORDS[COMP_CWORD]}"
${rootFlagValueBlock}  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${topLevelCommands} ${rootFlagWordList}" -- "\${currentWord}") )
    return
  fi

  case "\${COMP_WORDS[1]}" in
${nestedCases}
  esac
}

complete -F _altertable_completions altertable
`;
}

function formatZshContextBlock(
  context: CompletionContext,
  rootFlags: readonly CompletionFlag[],
): string {
  const wordIndex = completionWordIndex(context.segments.length);
  const pathMatch = formatZshPathMatch(context.segments);
  const variableName = formatContextVariableName(context.segments);
  const blocks: string[] = [];

  if (context.subcommands.length > 0) {
    blocks.push(`      if (( CURRENT == ${wordIndex} )) && [[ ${pathMatch} ]]; then
        local ${variableName}Commands=(${formatSubcommandNameList(context.subcommands)})
        _describe '${context.segments.join(" ")} commands' ${variableName}Commands
      fi`);
  }

  if (context.flags.length > 0) {
    const flagArgs = formatZshFlagArgumentLines(mergeCompletionFlags(context.flags, rootFlags));
    const depthCondition =
      context.subcommands.length > 0
        ? `(( CURRENT == ${wordIndex} ))`
        : `(( CURRENT >= ${wordIndex} ))`;

    blocks.push(`      if ${depthCondition} && [[ ${pathMatch} ]]; then
        _arguments \\
${flagArgs}
        return
      fi`);
  }

  return blocks.join("\n");
}

function formatZshNestedCases(
  contexts: readonly CompletionContext[],
  rootFlags: readonly CompletionFlag[],
): string {
  return [...groupCompletionContextsByTopLevel(contexts).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topLevel, topContexts]) => {
      const blocks = topContexts
        .map((context) => formatZshContextBlock(context, rootFlags))
        .filter((block) => block.length > 0)
        .join("\n");

      if (blocks.length === 0) {
        return undefined;
      }

      return `    ${topLevel})\n${blocks}\n      ;;`;
    })
    .filter((entry): entry is string => entry !== undefined)
    .join("\n");
}

export function formatZshCompletion(spec: CompletionNode): string {
  const topLevelCommands = formatSubcommandNodeList(spec.subcommands);
  const rootFlagArgs = formatZshFlagArgumentLines(spec.flags);
  const nestedCommandCases = formatZshNestedCases(collectCompletionContexts(spec), spec.flags);

  return `#compdef altertable
# altertable zsh completion
# Preferred install: altertable completion install zsh
# Manual install: altertable completion generate zsh > ~/.local/share/zsh/site-functions/_altertable

_altertable() {
  _arguments \\
${rootFlagArgs} \\
    '1: :->command' \\
    '*::arg:->args'

  case $state in
    command)
      local commands=(${topLevelCommands})
      _describe 'altertable commands' commands
      return
      ;;
    args)
      case $words[1] in
${nestedCommandCases}
      esac
      return 1
      ;;
  esac
}

_altertable "$@"
`;
}

export function formatFishCompletion(spec: CompletionNode): string {
  const topLevelCommands = formatSubcommandNodeList(spec.subcommands);
  const contexts = collectCompletionContexts(spec);
  const rootFlagLines = spec.flags.map((flag) => formatFishFlagCompleteLine(flag)).join("\n");

  const contextLines: string[] = [];

  for (const context of contexts) {
    if (context.subcommands.length > 0) {
      const condition = formatFishPathCondition(context.segments, context.subcommands);
      contextLines.push(
        `complete -c ${FISH_BINARY_NAME} -f -n "${condition}" -a "${formatSubcommandNameList(context.subcommands)}"`,
      );
    }

    if (context.flags.length === 0) {
      continue;
    }

    const condition = formatFishPathCondition(
      context.segments,
      context.subcommands.length > 0 ? context.subcommands : [],
    );

    for (const flag of context.flags) {
      contextLines.push(formatFishFlagCompleteLine(flag, { condition }));
    }
  }

  return `# altertable fish completion
# Preferred install: altertable completion install fish
# Manual install: altertable completion generate fish > ~/.config/fish/completions/altertable.fish

${rootFlagLines}
complete -c ${FISH_BINARY_NAME} -f -n "__fish_use_subcommand" -a "${topLevelCommands}"
${contextLines.join("\n")}
`;
}
