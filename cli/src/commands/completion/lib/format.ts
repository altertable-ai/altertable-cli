import { buildCompletionModel, type CompletionModel } from "@/commands/completion/lib/model.ts";
import type {
  CompletionContext,
  CompletionFlag,
  CompletionNode,
} from "@/commands/completion/lib/spec.ts";

const FISH_BINARY_NAME = "altertable";

export function groupCompletionContextsByTopLevel(
  contexts: readonly CompletionContext[],
): Map<string, CompletionContext[]> {
  const contextsByTopLevel = new Map<string, CompletionContext[]>();
  for (const context of contexts) {
    const topLevel = context.segments[0];
    if (!topLevel) continue;
    const group = contextsByTopLevel.get(topLevel) ?? [];
    group.push(context);
    contextsByTopLevel.set(topLevel, group);
  }
  return contextsByTopLevel;
}

export function mergeCompletionFlags(
  nodeFlags: readonly CompletionFlag[],
  rootFlags: readonly CompletionFlag[],
): CompletionFlag[] {
  const flags = new Map<string, CompletionFlag>();
  for (const flag of [...nodeFlags, ...rootFlags]) {
    flags.set(flag.name, flag);
  }
  return [...flags.values()];
}

function formatNameList(names: readonly string[]): string {
  return names.join(" ");
}

function flagForms(flag: CompletionFlag): string[] {
  return flag.alias ? [`-${flag.alias}`, `--${flag.name}`] : [`--${flag.name}`];
}

export function formatBashFlagWordList(flags: readonly CompletionFlag[]): string {
  return flags.flatMap(flagForms).join(" ");
}

function formatFlagValueSpecList(flags: readonly CompletionFlag[]): string {
  return flags
    .filter((flag) => flag.values && flag.values.length > 0)
    .map((flag) => {
      const names = flagForms(flag).join("|");
      return `"${names}=${flag.values?.join(",")}"`;
    })
    .join(" ");
}

function formatPath(segments: readonly string[]): string {
  return segments.join("/");
}

function formatShellCasePatterns(values: ReadonlySet<string>): string {
  return [...values].map((value) => `'${value}'`).join("|");
}

function formatEqualsCasePatterns(values: ReadonlySet<string>): string {
  return [...values].map((value) => `${value}=*`).join("|");
}

function formatSubcommandEdgePatterns(model: CompletionModel): string {
  return [...model.subcommandEdges]
    .sort()
    .map((edge) => `'${edge}'`)
    .join("|");
}

function formatBashNormalizer(model: CompletionModel): string {
  const valueFlags = formatShellCasePatterns(model.valueFlags);
  const equalsValueFlags = formatEqualsCasePatterns(model.valueFlags);
  const booleanFlags = formatShellCasePatterns(model.booleanFlags);
  const edges = formatSubcommandEdgePatterns(model);
  const valueFlagCase = valueFlags
    ? `      ${valueFlags})
        if ((index + 1 >= COMP_CWORD)); then
          ALTERTABLE_EXPECTS_FLAG_VALUE=1
          break
        fi
        ((index += 1))
        ;;`
    : "";
  const ignoredPatterns = [equalsValueFlags, booleanFlags].filter(Boolean).join("|");
  const ignoredFlagCase = ignoredPatterns
    ? `      ${ignoredPatterns})
        ;;`
    : "";

  return `_altertable_is_subcommand() {
  case "$1|$2" in
    ${edges}) return 0 ;;
  esac
  return 1
}

_altertable_record_operand() {
  local word="$1"
  local parentPath
  if [[ \${#ALTERTABLE_COMMAND_PATH[@]} -eq 0 ]]; then
    ALTERTABLE_COMMAND_PATH+=("\${word}")
    return
  fi
  parentPath="$(IFS=/; printf '%s' "\${ALTERTABLE_COMMAND_PATH[*]}")"
  if [[ \${#ALTERTABLE_POSITIONAL_WORDS[@]} -eq 0 ]] && _altertable_is_subcommand "\${parentPath}" "\${word}"; then
    ALTERTABLE_COMMAND_PATH+=("\${word}")
  else
    ALTERTABLE_POSITIONAL_WORDS+=("\${word}")
  fi
}

_altertable_normalize_words() {
  ALTERTABLE_COMMAND_PATH=()
  ALTERTABLE_POSITIONAL_WORDS=()
  ALTERTABLE_EXPECTS_FLAG_VALUE=0
  local afterSeparator=0
  local index word

  for ((index = 1; index < COMP_CWORD; index++)); do
    word="\${COMP_WORDS[index]}"
    if ((afterSeparator)); then
      _altertable_record_operand "\${word}"
      continue
    fi
    case "\${word}" in
      --)
        afterSeparator=1
        ;;
${valueFlagCase}
${ignoredFlagCase}
      *)
        _altertable_record_operand "\${word}"
        ;;
    esac
  done
  ALTERTABLE_COMMAND_PATH_STRING="$(IFS=/; printf '%s' "\${ALTERTABLE_COMMAND_PATH[*]}")"
}`;
}

function formatBashContextBlock(
  context: CompletionContext,
  rootFlags: readonly CompletionFlag[],
): string {
  const flags = mergeCompletionFlags(context.flags, rootFlags);
  const flagWords = formatBashFlagWordList(flags);
  const flagValueSpecs = formatFlagValueSpecList(flags);
  const flagValueBlock = flagValueSpecs
    ? `      if _altertable_complete_flag_value ${flagValueSpecs}; then
        return
      fi
`
    : "";
  const positionalBlocks = context.positionals
    .map((positional, index) => {
      if (!positional.values || positional.values.length === 0) return "";
      return `      if [[ \${#ALTERTABLE_POSITIONAL_WORDS[@]} -eq ${index} ]]; then
        COMPREPLY=( $(compgen -W "${formatNameList(positional.values)}" -- "\${currentWord}") )
        return
      fi
`;
    })
    .join("");
  const initialWords = formatNameList([...context.subcommands, ...flagWords.split(" ")]).trim();

  return `    '${formatPath(context.segments)}')
${flagValueBlock}      if [[ \${ALTERTABLE_EXPECTS_FLAG_VALUE} -eq 1 ]]; then
        return
      fi
${positionalBlocks}      if [[ \${#ALTERTABLE_POSITIONAL_WORDS[@]} -eq 0 ]]; then
        COMPREPLY=( $(compgen -W "${initialWords}" -- "\${currentWord}") )
      else
        COMPREPLY=( $(compgen -W "${flagWords}" -- "\${currentWord}") )
      fi
      return
      ;;`;
}

export function formatBashCompletion(spec: CompletionNode): string {
  const model = buildCompletionModel(spec);
  const topLevelCommands = formatNameList(spec.subcommands.map((command) => command.name));
  const rootFlagWords = formatBashFlagWordList(spec.flags);
  const rootFlagValueSpecs = formatFlagValueSpecList(spec.flags);
  const normalizer = formatBashNormalizer(model);
  const contexts = model.contexts
    .map((context) => formatBashContextBlock(context, spec.flags))
    .join("\n");

  return `# altertable bash completion
# Preferred install: altertable completion install bash
# Manual install: altertable completion generate bash > ~/.local/share/bash-completion/completions/altertable

_altertable_complete_flag_value() {
  local previousWord="\${COMP_WORDS[COMP_CWORD - 1]}"
  local spec flagNames values flagName valuePrefix completion
  local -a flagNamesArray completions

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
          COMPREPLY+=("\${flagName}=\${completion}")
        done
        return 0
      fi
    done
  done
  return 1
}

${normalizer}

_altertable_completions() {
  local currentWord="\${COMP_WORDS[COMP_CWORD]}"
  _altertable_normalize_words

  if [[ -z "\${ALTERTABLE_COMMAND_PATH_STRING}" ]]; then
    ${rootFlagValueSpecs ? `if _altertable_complete_flag_value ${rootFlagValueSpecs}; then return; fi` : ""}
    if [[ \${ALTERTABLE_EXPECTS_FLAG_VALUE} -eq 1 ]]; then return; fi
    COMPREPLY=( $(compgen -W "${topLevelCommands} ${rootFlagWords}" -- "\${currentWord}") )
    return
  fi

  case "\${ALTERTABLE_COMMAND_PATH_STRING}" in
${contexts}
  esac
}

complete -F _altertable_completions altertable
`;
}

function formatZshNormalizer(model: CompletionModel): string {
  const valueFlags = formatShellCasePatterns(model.valueFlags);
  const equalsValueFlags = formatEqualsCasePatterns(model.valueFlags);
  const booleanFlags = formatShellCasePatterns(model.booleanFlags);
  const edges = formatSubcommandEdgePatterns(model);
  const valueFlagCase = valueFlags
    ? `      ${valueFlags})
        if (( index + 1 >= CURRENT )); then
          ALTERTABLE_EXPECTS_FLAG_VALUE=1
          break
        fi
        (( index += 1 ))
        ;;`
    : "";
  const ignoredPatterns = [equalsValueFlags, booleanFlags].filter(Boolean).join("|");
  const ignoredFlagCase = ignoredPatterns
    ? `      ${ignoredPatterns})
        ;;`
    : "";

  return `_altertable_is_subcommand() {
  case "$1|$2" in
    ${edges}) return 0 ;;
  esac
  return 1
}

_altertable_record_operand() {
  local word="$1"
  local parentPath="\${(j:/:)ALTERTABLE_COMMAND_PATH}"
  if (( \${#ALTERTABLE_COMMAND_PATH[@]} == 0 )); then
    ALTERTABLE_COMMAND_PATH+=("\${word}")
  elif (( \${#ALTERTABLE_POSITIONAL_WORDS[@]} == 0 )) && _altertable_is_subcommand "\${parentPath}" "\${word}"; then
    ALTERTABLE_COMMAND_PATH+=("\${word}")
  else
    ALTERTABLE_POSITIONAL_WORDS+=("\${word}")
  fi
}

_altertable_normalize_words() {
  ALTERTABLE_COMMAND_PATH=()
  ALTERTABLE_POSITIONAL_WORDS=()
  ALTERTABLE_EXPECTS_FLAG_VALUE=0
  integer afterSeparator=0
  integer index=2
  local word

  while (( index < CURRENT )); do
    word="\${words[index]}"
    if (( afterSeparator )); then
      _altertable_record_operand "\${word}"
      (( index += 1 ))
      continue
    fi
    case "\${word}" in
      --)
        afterSeparator=1
        ;;
${valueFlagCase}
${ignoredFlagCase}
      *)
        _altertable_record_operand "\${word}"
        ;;
    esac
    (( index += 1 ))
  done
  ALTERTABLE_COMMAND_PATH_STRING="\${(j:/:)ALTERTABLE_COMMAND_PATH}"
}`;
}

function formatZshContextBlock(
  context: CompletionContext,
  rootFlags: readonly CompletionFlag[],
): string {
  const flags = mergeCompletionFlags(context.flags, rootFlags);
  const flagWords = formatBashFlagWordList(flags);
  const flagValueSpecs = formatFlagValueSpecList(flags);
  const flagValueBlock = flagValueSpecs
    ? `      if _altertable_complete_flag_value ${flagValueSpecs}; then return; fi
`
    : "";
  const positionalBlocks = context.positionals
    .map((positional, index) => {
      if (!positional.values || positional.values.length === 0) return "";
      return `      if (( \${#ALTERTABLE_POSITIONAL_WORDS[@]} == ${index} )); then
        _altertable_add_words ${formatNameList(positional.values)}
        return
      fi
`;
    })
    .join("");
  const initialWords = formatNameList([...context.subcommands, ...flagWords.split(" ")]).trim();

  return `    '${formatPath(context.segments)}')
${flagValueBlock}      if (( ALTERTABLE_EXPECTS_FLAG_VALUE )); then return; fi
${positionalBlocks}      if (( \${#ALTERTABLE_POSITIONAL_WORDS[@]} == 0 )); then
        _altertable_add_words ${initialWords}
      else
        _altertable_add_words ${flagWords}
      fi
      return
      ;;`;
}

export function formatZshCompletion(spec: CompletionNode): string {
  const model = buildCompletionModel(spec);
  const topLevelCommands = formatNameList(spec.subcommands.map((command) => command.name));
  const rootFlagWords = formatBashFlagWordList(spec.flags);
  const rootFlagValueSpecs = formatFlagValueSpecList(spec.flags);
  const normalizer = formatZshNormalizer(model);
  const contexts = model.contexts
    .map((context) => formatZshContextBlock(context, spec.flags))
    .join("\n");

  return `#compdef altertable
# altertable zsh completion
# Preferred install: altertable completion install zsh
# Manual install: altertable completion generate zsh > ~/.local/share/zsh/site-functions/_altertable

_altertable_add_words() {
  local candidate
  local -a matches
  for candidate in "$@"; do
    if [[ -z "\${PREFIX}" || "\${candidate}" == "\${PREFIX}"* ]]; then
      matches+=("\${candidate}")
    fi
  done
  (( \${#matches[@]} > 0 )) && compadd -- "\${matches[@]}"
}

_altertable_complete_flag_value() {
  local previousWord="\${words[CURRENT - 1]}"
  local spec flagNames values flagName valuePrefix candidate
  local -a matches
  for spec in "$@"; do
    flagNames="\${spec%%=*}"
    values="\${spec#*=}"
    for flagName in \${(s:|:)flagNames}; do
      if [[ "\${previousWord}" == "\${flagName}" ]]; then
        _altertable_add_words \${(s:,:)values}
        return 0
      fi
      if [[ "\${PREFIX}" == "\${flagName}="* ]]; then
        valuePrefix="\${PREFIX#"\${flagName}="}"
        matches=()
        for candidate in \${(s:,:)values}; do
          [[ "\${candidate}" == "\${valuePrefix}"* ]] && matches+=("\${candidate}")
        done
        (( \${#matches[@]} > 0 )) && compadd -P "\${flagName}=" -- "\${matches[@]}"
        return 0
      fi
    done
  done
  return 1
}

${normalizer}

_altertable() {
  _altertable_normalize_words

  if [[ -z "\${ALTERTABLE_COMMAND_PATH_STRING}" ]]; then
    ${rootFlagValueSpecs ? `if _altertable_complete_flag_value ${rootFlagValueSpecs}; then return; fi` : ""}
    if (( ALTERTABLE_EXPECTS_FLAG_VALUE )); then return; fi
    _altertable_add_words ${topLevelCommands} ${rootFlagWords}
    return
  fi

  case "\${ALTERTABLE_COMMAND_PATH_STRING}" in
${contexts}
  esac
}

if (( $+functions[compdef] )); then
  compdef _altertable altertable
fi
`;
}

function escapeFishDescription(description: string): string {
  return description.replace(/'/g, "\\'");
}

export function formatFishPathCondition(
  segments: readonly string[],
  positionalCount: number | "any" = "any",
): string {
  return `__altertable_using_context '${formatPath(segments)}' '${positionalCount}'`;
}

function formatFishFlagCompleteLine(flag: CompletionFlag, condition?: string): string {
  const shortFlag = flag.alias ? ` -s ${flag.alias}` : "";
  const description = flag.description ? ` -d '${escapeFishDescription(flag.description)}'` : "";
  const values =
    flag.values && flag.values.length > 0 ? ` -f -r -a "${flag.values.join(" ")}"` : "";
  const conditionArg = condition ? ` -n "${condition}"` : "";
  return `complete -c ${FISH_BINARY_NAME}${shortFlag} -l ${flag.name}${description}${values}${conditionArg}`;
}

function formatFishNormalizer(model: CompletionModel): string {
  const valueFlags = [...model.valueFlags].map((flag) => `'${flag}'`).join(" ");
  const equalsValueFlags = [...model.valueFlags].map((flag) => `'${flag}=*'`).join(" ");
  const booleanFlags = [...model.booleanFlags].map((flag) => `'${flag}'`).join(" ");
  const edges = [...model.subcommandEdges]
    .sort()
    .map((edge) => `'${edge}'`)
    .join(" ");
  const valueFlagCase = valueFlags
    ? `      case ${valueFlags}
        set index (math $index + 1)`
    : "";
  const ignoredPatterns = [equalsValueFlags, booleanFlags].filter(Boolean).join(" ");
  const ignoredFlagCase = ignoredPatterns ? `      case ${ignoredPatterns}` : "";

  return `function __altertable_is_subcommand
  switch "$argv[1]|$argv[2]"
    case ${edges}
      return 0
  end
  return 1
end

function __altertable_using_context
  set -l expected_path $argv[1]
  set -l expected_positionals $argv[2]
  set -l tokens (commandline -opc)
  if test (count $tokens) -gt 0
    set -e tokens[1]
  end

  set -l path
  set -l positional_count 0
  set -l after_separator 0
  set -l index 1
  while test $index -le (count $tokens)
    set -l word $tokens[$index]
    if test $after_separator -eq 1
      set positional_count (math $positional_count + 1)
      set index (math $index + 1)
      continue
    end
    switch $word
      case --
        set after_separator 1
${valueFlagCase}
${ignoredFlagCase}
      case '*'
        if test -z "$path"
          set path $word
        else if test $positional_count -eq 0; and __altertable_is_subcommand "$path" "$word"
          set path "$path/$word"
        else
          set positional_count (math $positional_count + 1)
        end
    end
    set index (math $index + 1)
  end

  test "$path" = "$expected_path"; or return 1
  if test "$expected_positionals" != any
    test $positional_count -eq $expected_positionals; or return 1
  end
  return 0
end`;
}

export function formatFishCompletion(spec: CompletionNode): string {
  const model = buildCompletionModel(spec);
  const topLevelCommands = formatNameList(spec.subcommands.map((command) => command.name));
  const normalizer = formatFishNormalizer(model);
  const rootFlagLines = spec.flags.map((flag) => formatFishFlagCompleteLine(flag)).join("\n");
  const contextLines: string[] = [];

  for (const context of model.contexts) {
    if (context.subcommands.length > 0) {
      const condition = formatFishPathCondition(context.segments, 0);
      contextLines.push(
        `complete -c ${FISH_BINARY_NAME} -f -n "${condition}" -a "${formatNameList(context.subcommands)}"`,
      );
    }
    for (const [index, positional] of context.positionals.entries()) {
      if (!positional.values || positional.values.length === 0) continue;
      const condition = formatFishPathCondition(context.segments, index);
      contextLines.push(
        `complete -c ${FISH_BINARY_NAME} -f -n "${condition}" -a "${formatNameList(positional.values)}"`,
      );
    }
    const flagCondition = formatFishPathCondition(context.segments);
    for (const flag of context.flags) {
      contextLines.push(formatFishFlagCompleteLine(flag, flagCondition));
    }
  }

  return `# altertable fish completion
# Preferred install: altertable completion install fish
# Manual install: altertable completion generate fish > ~/.config/fish/completions/altertable.fish

${normalizer}

${rootFlagLines}
complete -c ${FISH_BINARY_NAME} -f -n "${formatFishPathCondition([], 0)}" -a "${topLevelCommands}"
${contextLines.join("\n")}
`;
}
