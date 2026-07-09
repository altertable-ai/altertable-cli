import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testsDir);
const cliPath = join(repoRoot, "bin", "altertable");

type EnvValue = string | undefined;
type TestEnv = Record<string, EnvValue>;

type RunOptions = {
  env?: TestEnv;
  stdin?: string;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type TestWorkspace = {
  configHome: string;
  env: TestEnv;
  cleanup: () => Promise<void>;
  run: (args: string[], options?: RunOptions) => Promise<CommandResult>;
  setupMockHttp: (mocks: unknown) => Promise<void>;
};

export async function createTestWorkspace(env: TestEnv = {}): Promise<TestWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "altertable-cli-test-"));
  const configHome = join(root, "config");
  const mockHttpFile = join(root, "mocks.json");
  const baseEnv: TestEnv = {
    ALTERTABLE_CONFIG_HOME: configHome,
    ALTERTABLE_SECRET_BACKEND: "file",
    ...env,
  };

  return {
    configHome,
    env: baseEnv,
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    async run(args, options = {}) {
      return runAltertable(args, {
        ...options,
        env: { ...baseEnv, ...options.env },
      });
    },
    async setupMockHttp(mocks) {
      await writeFile(mockHttpFile, JSON.stringify(mocks));
      baseEnv.ALTERTABLE_MOCK_HTTP_FILE = mockHttpFile;
    },
  };
}

export async function runAltertable(
  args: string[],
  options: RunOptions = {},
): Promise<CommandResult> {
  const env = buildEnv(options.env);
  const proc = Bun.spawn([cliPath, ...args], {
    cwd: repoRoot,
    env,
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = new Response(proc.stdout).text();
  const stderr = new Response(proc.stderr).text();

  if (options.stdin !== undefined && proc.stdin) {
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(options.stdin));
    await writer.close();
  }

  return {
    exitCode: await proc.exited,
    stdout: await stdout,
    stderr: await stderr,
  };
}

function buildEnv(overrides: TestEnv = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}
