import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testsDir);

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
  root: string;
  configHome: string;
  configFile: string;
  credentialsFile: string;
  defaultProfileConfig: string;
  env: TestEnv;
  cleanup: () => Promise<void>;
  resetConfig: () => Promise<void>;
  runCommand: (command: string, options?: RunOptions) => Promise<CommandResult>;
  setupHttpLog: () => Promise<void>;
  setupMockHttp: (mocks: unknown) => Promise<void>;
  clearMockHttp: () => void;
  readFile: (path: string) => Promise<string>;
  readHttpLog: () => Promise<string>;
  httpLogValues: (key: string) => Promise<string[]>;
  httpLogValue: (key: string) => Promise<string | undefined>;
  fileMode: (path: string) => Promise<string>;
  chmod: (path: string, mode: number) => Promise<void>;
};

export async function createTestWorkspace(env: TestEnv = {}): Promise<TestWorkspace> {
  const root = await mkdtemp(join(tmpdir(), "altertable-cli-test-"));
  const configHome = join(root, "config");
  const mockHttpFile = join(root, "mocks.json");
  const httpLogFile = join(root, "req.log");
  const configFile = join(configHome, "config");
  const credentialsFile = join(configHome, "credentials");
  const defaultProfileConfig = join(configHome, "profiles", "default", "config");
  const baseEnv: TestEnv = {
    ALTERTABLE_CONFIG_HOME: configHome,
    ALTERTABLE_SECRET_BACKEND: "file",
    ...env,
  };

  return {
    root,
    configHome,
    configFile,
    credentialsFile,
    defaultProfileConfig,
    env: baseEnv,
    async cleanup() {
      await rm(root, { force: true, recursive: true });
    },
    async resetConfig() {
      await rm(configFile, { force: true });
      await rm(credentialsFile, { force: true });
      await rm(join(configHome, "profiles"), { force: true, recursive: true });
    },
    async runCommand(command, options = {}) {
      return runShellCommand(command, {
        ...options,
        env: { ...baseEnv, ...options.env },
      });
    },
    async setupHttpLog() {
      await writeFile(httpLogFile, "");
      baseEnv.ALTERTABLE_HTTP_LOG = httpLogFile;
    },
    async setupMockHttp(mocks) {
      await writeFile(mockHttpFile, typeof mocks === "string" ? mocks : JSON.stringify(mocks));
      baseEnv.ALTERTABLE_MOCK_HTTP_FILE = mockHttpFile;
    },
    clearMockHttp() {
      delete baseEnv.ALTERTABLE_MOCK_HTTP_FILE;
    },
    async readFile(path) {
      return Bun.file(path).text();
    },
    async readHttpLog() {
      return Bun.file(httpLogFile).text();
    },
    async httpLogValues(key) {
      return readHttpLogValues(httpLogFile, key);
    },
    async httpLogValue(key) {
      const values = await readHttpLogValues(httpLogFile, key);
      return values.at(-1);
    },
    async fileMode(path) {
      const info = await stat(path);
      return (info.mode & 0o777).toString(8);
    },
    async chmod(path, mode) {
      await chmod(path, mode);
    },
  };
}

export async function runShellCommand(
  command: string,
  options: RunOptions = {},
): Promise<CommandResult> {
  return runProcess(["/bin/bash", "-c", command], options);
}

async function runProcess(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  const env = buildEnv(options.env);
  const proc = Bun.spawn(args, {
    cwd: repoRoot,
    env,
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = new Response(proc.stdout).text();
  const stderr = new Response(proc.stderr).text();

  if (options.stdin !== undefined && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
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
  env.PATH = `${join(repoRoot, "bin")}:${env.PATH ?? ""}`;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

export async function fileExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists();
}

async function readHttpLogValues(path: string, key: string): Promise<string[]> {
  const prefix = `${key}=`;
  const log = await Bun.file(path).text();
  return log
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
}

export async function appendFile(path: string, content: string): Promise<void> {
  const previous = await Bun.file(path).text();
  await writeFile(path, previous + content);
}

export async function writeWorkspaceFile(
  workspace: TestWorkspace,
  name: string,
  content: string,
): Promise<string> {
  const path = join(workspace.root, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}
