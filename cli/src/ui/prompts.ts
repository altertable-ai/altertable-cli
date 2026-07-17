import {
  confirm as clackConfirm,
  isCancel,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from "@clack/prompts";
import { stdin as input, stderr as output } from "node:process";
import { CliError } from "@/lib/errors.ts";
import { ensurePromptColorAlignment } from "@/ui/terminal/styles.ts";

export type SelectOption = { value: string; label: string };
export type ReadSelectOptions = { leadingNewline?: boolean };

export type Prompts = {
  writePrompt(line: string): void;
  readLine(prompt: string): Promise<string>;
  readPassword(prompt: string): Promise<string>;
  readSelect(
    title: string,
    options: SelectOption[],
    defaultValue?: string,
    selectOptions?: ReadSelectOptions,
  ): Promise<string>;
  readConfirm(prompt: string, defaultYes?: boolean): Promise<boolean>;
};

export class PromptCancelled extends CliError {
  constructor() {
    super("Prompt cancelled.");
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
      if (settled) return;
      settled = true;
      input.off("data", onData);
      input.off("end", settle);
      resolve((buffer.split("\n")[0] ?? buffer).trim());
    }

    function onData(chunk: Buffer): void {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\n")) settle();
    }

    input.on("data", onData);
    input.on("end", settle);
    input.resume();
  });
}

function normalizePromptMessage(prompt: string): string {
  return prompt.trim().replace(/:\s*$/, "");
}

function resolvePromptResult(result: string | symbol): string {
  if (isCancel(result)) throw new PromptCancelled();
  return result;
}

async function readInteractiveLine(prompt: string): Promise<string> {
  if (!input.isTTY) {
    writePromptLine(prompt);
    return (await readStdinLine()).trim();
  }
  ensurePromptColorAlignment();
  return resolvePromptResult(
    await clackText({ message: normalizePromptMessage(prompt), input, output }),
  );
}

async function readHiddenPassword(prompt: string): Promise<string> {
  if (!input.isTTY) {
    writePromptLine(prompt);
    return (await readStdinLine()).trim();
  }
  ensurePromptColorAlignment();
  return resolvePromptResult(
    await clackPassword({ message: normalizePromptMessage(prompt), input, output }),
  );
}

async function readSelect(
  title: string,
  options: SelectOption[],
  defaultValue?: string,
  selectOptions: ReadSelectOptions = {},
): Promise<string> {
  if (options.length === 0) throw new CliError("No options available.");
  if (!input.isTTY) throw new CliError("Interactive select requires a TTY.");
  if (selectOptions.leadingNewline !== false) writePromptLine("\n");

  ensurePromptColorAlignment();
  return resolvePromptResult(
    await clackSelect({
      message: title,
      options: options.map((option) => ({
        ...option,
        hint: option.value === defaultValue ? "default" : undefined,
      })),
      initialValue: defaultValue,
      input,
      output,
    }),
  );
}

async function readConfirm(prompt: string, defaultYes = true): Promise<boolean> {
  if (!input.isTTY) {
    const answer = (await readStdinLine()).trim().toLowerCase();
    return answer === "" ? defaultYes : answer === "y" || answer === "yes";
  }

  ensurePromptColorAlignment();
  const result = await clackConfirm({
    message: normalizePromptMessage(prompt),
    initialValue: defaultYes,
    input,
    output,
  });
  if (isCancel(result)) throw new PromptCancelled();
  return result;
}

export const defaultPrompts: Prompts = {
  writePrompt: writePromptLine,
  readLine: readInteractiveLine,
  readPassword: readHiddenPassword,
  readSelect,
  readConfirm,
};
