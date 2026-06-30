import {
  confirm as clackConfirm,
  isCancel,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { stdin as input, stderr as output } from "node:process";
import { CliError } from "@/lib/errors.ts";
import { ensurePromptColorAlignment } from "@/lib/terminal-style.ts";
export type ConfigureSelectOption = {
  value: string;
  label: string;
};

export type ConfigureReadSelectOptions = {
  leadingNewline?: boolean;
};

export type ConfigurePrompts = {
  writePrompt(line: string): void;
  readLine(prompt: string): Promise<string>;
  readPassword(prompt: string): Promise<string>;
  readSelect(
    title: string,
    options: ConfigureSelectOption[],
    defaultValue?: string,
    selectOptions?: ConfigureReadSelectOptions,
  ): Promise<string>;
  readConfirm(prompt: string, defaultYes?: boolean): Promise<boolean>;
};

export class ConfigurePromptCancelled extends CliError {
  constructor() {
    super("Configuration cancelled.");
  }
}

function writePromptLine(line: string): void {
  process.stderr.write(line);
}

async function readStdinLine(): Promise<string> {
  return await new Promise((resolve) => {
    let buffer = "";
    let settled = false;

    function settle(): void {
      if (settled) {
        return;
      }
      settled = true;
      input.off("data", onData);
      input.off("end", settle);
      resolve((buffer.split("\n")[0] ?? buffer).trim());
    }

    function onData(chunk: Buffer): void {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\n")) {
        settle();
      }
    }

    input.on("data", onData);
    input.on("end", settle);
    input.resume();
  });
}

async function readInteractiveLine(prompt: string): Promise<string> {
  if (!input.isTTY) {
    writePromptLine(prompt);
    return (await readStdinLine()).trim();
  }
  ensurePromptColorAlignment();
  const result = await clackText({
    message: normalizePromptMessage(prompt),
    input,
    output,
  });
  return resolvePromptResult(result);
}

async function readHiddenPassword(prompt: string): Promise<string> {
  if (!input.isTTY) {
    writePromptLine(prompt);
    return (await readStdinLine()).trim();
  }

  ensurePromptColorAlignment();
  const result = await clackPassword({
    message: normalizePromptMessage(prompt),
    input,
    output,
  });
  return resolvePromptResult(result);
}

function normalizePromptMessage(prompt: string): string {
  return prompt.trim().replace(/:\s*$/, "");
}

function resolvePromptResult(result: string | symbol): string {
  if (isCancel(result)) {
    throw new ConfigurePromptCancelled();
  }
  return result;
}

async function readSelect(
  title: string,
  options: ConfigureSelectOption[],
  defaultValue?: string,
  selectOptions: ConfigureReadSelectOptions = {},
): Promise<string> {
  if (options.length === 0) {
    throw new CliError("No options available.");
  }

  const leadingNewline = selectOptions.leadingNewline !== false ? "\n" : "";

  if (!input.isTTY) {
    throw new CliError("Interactive select requires a TTY.");
  }

  if (leadingNewline) {
    writePromptLine(leadingNewline);
  }

  ensurePromptColorAlignment();
  const result = await clackSelect({
    message: title,
    options: options.map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.value === defaultValue ? "default" : undefined,
    })),
    initialValue: defaultValue,
    input,
    output,
  });
  return resolvePromptResult(result);
}

async function readConfirm(prompt: string, defaultYes = true): Promise<boolean> {
  if (!input.isTTY) {
    const answer = (await readStdinLine()).trim().toLowerCase();
    if (answer === "") {
      return defaultYes;
    }
    return answer === "y" || answer === "yes";
  }

  ensurePromptColorAlignment();
  const result = await clackConfirm({
    message: normalizePromptMessage(prompt),
    initialValue: defaultYes,
    input,
    output,
  });
  if (isCancel(result)) {
    throw new ConfigurePromptCancelled();
  }
  return result;
}

export const defaultConfigurePrompts: ConfigurePrompts = {
  writePrompt: writePromptLine,
  readLine: readInteractiveLine,
  readPassword: readHiddenPassword,
  readSelect,
  readConfirm,
};
