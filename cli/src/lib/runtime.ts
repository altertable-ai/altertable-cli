import type { CliContext } from "@/context.ts";
import { getBootstrapCliContext } from "@/context.ts";
import { existsSync } from "node:fs";
import { writeLakehouseCommandOutput } from "@/lib/command-output.ts";
import { createCliSession, type CliSession } from "@/lib/cli-session.ts";
import { configFile } from "@/lib/config.ts";
import { profilesDir } from "@/lib/profile.ts";

export type OutputSink = {
  json: boolean;
  debug: boolean;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
  writeJson(data: unknown): void;
  writeRaw(body: string): void;
  writeHuman(text: string): void;
  writeMetadata(lines: string[]): void;
};

export type CliRuntime = {
  context: CliContext;
  output: OutputSink;
  session?: CliSession;
};

let cliRuntime: CliRuntime | undefined;

export function isCliRuntimeReady(): boolean {
  return cliRuntime !== undefined;
}

function createDefaultOutputSink(context: CliContext): OutputSink {
  return {
    json: context.json,
    debug: context.debug,
    writeStdout(line: string): void {
      console.log(line);
    },
    writeStderr(line: string): void {
      console.error(line);
    },
    writeJson(data: unknown): void {
      console.log(JSON.stringify(data, null, 2));
    },
    writeRaw(body: string): void {
      console.log(body);
    },
    writeHuman(text: string): void {
      console.log(text);
    },
    writeMetadata(lines: string[]): void {
      for (const line of lines) {
        console.error(line);
      }
    },
  };
}

export function createCliRuntime(context: CliContext): CliRuntime {
  return {
    context,
    output: createDefaultOutputSink(context),
  };
}

export function getCliRuntime(): CliRuntime {
  if (!cliRuntime) {
    cliRuntime = createCliRuntime(getBootstrapCliContext());
  }
  return cliRuntime;
}

export function setCliRuntime(runtime: CliRuntime): void {
  cliRuntime = runtime;
}

export function runWithCliRuntime<T>(runtime: CliRuntime, fn: () => T): T {
  const previous = cliRuntime;
  cliRuntime = runtime;
  try {
    return fn();
  } finally {
    cliRuntime = previous;
  }
}

export function refreshCliRuntimeContext(context: CliContext): void {
  const runtime = getCliRuntime();
  runtime.context = context;
  runtime.output.json = context.json;
  runtime.output.debug = context.debug;
  if (existsSync(configFile()) || existsSync(profilesDir())) {
    runtime.session = createCliSession(context);
    return;
  }
  runtime.session = undefined;
}

export function getOutputSink(): OutputSink {
  return getCliRuntime().output;
}

export function writeRawIfJsonElseHuman(
  rawBody: string,
  humanFormatter?: (parsed: unknown) => string,
): void {
  writeLakehouseCommandOutput(rawBody, { humanFormatter });
}
