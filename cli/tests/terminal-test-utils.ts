import { setTerminalColorMode } from "@/ui/terminal/styles.ts";

const TERMINAL_ENV_KEYS = [
  "ALTERTABLE_COLOR",
  "CI",
  "FORCE_COLOR",
  "NO_COLOR",
  "OSC_HYPERLINK",
  "TERM",
  "TEST",
] as const;

type TerminalEnvKey = (typeof TERMINAL_ENV_KEYS)[number];

export type TerminalTestState = {
  env: Record<TerminalEnvKey, string | undefined>;
  stdoutIsTTY: boolean | undefined;
  stderrIsTTY: boolean | undefined;
};

export function snapshotTerminalState(): TerminalTestState {
  return {
    env: Object.fromEntries(
      TERMINAL_ENV_KEYS.map((key) => [key, process.env[key]]),
    ) as TerminalTestState["env"],
    stdoutIsTTY: process.stdout.isTTY,
    stderrIsTTY: process.stderr.isTTY,
  };
}

export function restoreTerminalState(state: TerminalTestState): void {
  setTerminalColorMode(undefined);
  for (const [key, value] of Object.entries(state.env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  Object.defineProperty(process.stdout, "isTTY", {
    value: state.stdoutIsTTY,
    configurable: true,
  });
  Object.defineProperty(process.stderr, "isTTY", {
    value: state.stderrIsTTY,
    configurable: true,
  });
}

export function forceTerminalColorForTests(): void {
  delete process.env.NO_COLOR;
  delete process.env.TEST;
  delete process.env.CI;
  delete process.env.FORCE_COLOR;
  delete process.env.ALTERTABLE_COLOR;
  process.env.TERM = "xterm-256color";
  setTerminalColorMode("always");
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
}

export function forceNoTerminalColorForTests(): void {
  setTerminalColorMode("never");
  process.env.NO_COLOR = "1";
}
