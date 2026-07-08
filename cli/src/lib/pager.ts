import { spawnSync } from "node:child_process";
import { getQueryDefaultPager } from "@/lib/config.ts";
import { getOutputSink, type OutputSink } from "@/lib/runtime.ts";
import { getVisibleTextWidth } from "@/ui/terminal/styles.ts";

export type PagerMode = "auto" | "always" | "never";

export type PagerOptions = {
  mode: PagerMode;
};

export function resolvePagerOptions(cliMode?: PagerMode): PagerOptions {
  if (cliMode !== undefined) {
    return { mode: cliMode };
  }

  const defaultPager = getQueryDefaultPager();
  return { mode: defaultPager ?? "auto" };
}

export function shouldUsePager(text: string, options: PagerOptions): boolean {
  if (options.mode === "never") {
    return false;
  }
  if (!process.stdout.isTTY) {
    return false;
  }
  if (options.mode === "always") {
    return true;
  }
  const lineCount = text.split("\n").length;
  const rows = process.stdout.rows ?? 24;
  const columns = process.stdout.columns ?? 80;
  const hasWideLine = text.split("\n").some((line) => getVisibleTextWidth(line) > columns);
  return lineCount > rows || hasWideLine;
}

export function buildPagerEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...env, LESS: "FRX", LESSCHARSET: env.LESSCHARSET ?? "utf-8" };
}

export async function writePagedOutput(
  text: string,
  options: PagerOptions,
  sink: OutputSink = getOutputSink(),
): Promise<void> {
  if (!shouldUsePager(text, options)) {
    sink.writeHuman(text);
    return;
  }

  const result = spawnSync("less", ["-SR"], {
    input: text,
    stdio: ["pipe", "inherit", "inherit"],
    env: buildPagerEnv(),
  });

  if (result.error) {
    sink.writeHuman(text);
  }
}
