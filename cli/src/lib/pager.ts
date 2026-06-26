import { spawnSync } from "node:child_process";
import { getQueryDefaultPager } from "@/lib/config.ts";
import { getOutputSink, type OutputSink } from "@/lib/runtime.ts";

export type PagerOptions = {
  force?: boolean;
  disable?: boolean;
};

export function resolvePagerOptions(cliFlags: PagerOptions): PagerOptions {
  if (cliFlags.force || cliFlags.disable) {
    return cliFlags;
  }

  const defaultPager = getQueryDefaultPager();
  if (defaultPager === "always") {
    return { force: true };
  }
  if (defaultPager === "never") {
    return { disable: true };
  }
  return {};
}

export function shouldUsePager(text: string, options: PagerOptions): boolean {
  if (options.disable) {
    return false;
  }
  if (!process.stdout.isTTY) {
    return false;
  }
  if (options.force) {
    return true;
  }
  const lineCount = text.split("\n").length;
  const rows = process.stdout.rows ?? 24;
  return lineCount > rows;
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
    env: { ...process.env, LESS: "FRX" },
  });

  if (result.error) {
    sink.writeHuman(text);
  }
}
