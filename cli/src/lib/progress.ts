import { isJsonOutput } from "@/context.ts";
import {
  terminalAccent,
  terminalError,
  terminalMuted,
  terminalSuccess,
} from "@/ui/terminal/styles.ts";

export type ProgressHandle = {
  done: (message?: string) => void;
  fail: (message?: string) => void;
};

export type ProgressStatus = "active" | "success" | "error";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

const noopHandle: ProgressHandle = {
  done() {},
  fail() {},
};

export function shouldShowProgress(): boolean {
  if (isJsonOutput()) {
    return false;
  }
  if (process.stderr.isTTY !== true) {
    return false;
  }
  return true;
}

export function formatUploadProgress(sentBytes: number, totalBytes: number): string {
  if (totalBytes <= 0) {
    return terminalMuted(`Uploading ${sentBytes} bytes`);
  }

  const percent = Math.min(100, Math.round((sentBytes / totalBytes) * 100));
  return terminalMuted(`Uploading ${percent}% (${sentBytes}/${totalBytes} bytes)`);
}

export function formatProgressStatus(status: ProgressStatus, message: string): string {
  if (status === "success") {
    return `${terminalSuccess("✓")} ${message}`;
  }
  if (status === "error") {
    return `${terminalError("✗")} ${message}`;
  }
  return terminalMuted(message);
}

export type UploadProgressReporter = {
  report: (sentBytes: number, totalBytes: number) => void;
  clear: () => void;
};

export function createUploadProgressReporter(totalBytes: number): UploadProgressReporter {
  if (!shouldShowProgress()) {
    return {
      report() {},
      clear() {},
    };
  }

  let previousLineLength = 0;

  function report(sentBytes: number, total: number) {
    const line = formatUploadProgress(sentBytes, total);
    const padding =
      previousLineLength > line.length ? " ".repeat(previousLineLength - line.length) : "";
    process.stderr.write(`\r${line}${padding}`);
    previousLineLength = line.length;
  }

  function clear() {
    if (previousLineLength > 0) {
      process.stderr.write(`\r${" ".repeat(previousLineLength)}\r`);
      previousLineLength = 0;
    }
  }

  report(0, totalBytes);
  return { report, clear };
}

export function startProgress(message: string): ProgressHandle {
  if (!shouldShowProgress()) {
    return noopHandle;
  }

  const label = message.endsWith("…") ? message : `${message}…`;
  let frameIndex = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  function writeFrame() {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length] ?? "⠋";
    frameIndex += 1;
    process.stderr.write(`\r${terminalAccent(frame)} ${formatProgressStatus("active", label)}`);
  }

  writeFrame();
  intervalId = setInterval(writeFrame, SPINNER_INTERVAL_MS);

  function clearLine(finalMessage?: string) {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
    process.stderr.write(`\r${" ".repeat(label.length + 4)}\r`);
    if (finalMessage !== undefined && finalMessage.length > 0) {
      process.stderr.write(`${finalMessage}\n`);
      return;
    }
    process.stderr.write("\n");
  }

  return {
    done(finalMessage?: string) {
      clearLine(finalMessage);
    },
    fail(finalMessage?: string) {
      clearLine(finalMessage);
    },
  };
}
