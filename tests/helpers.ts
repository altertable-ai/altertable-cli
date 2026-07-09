import { appendFile as appendFsFile, chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MockHttpResponse } from "./mock-http.ts";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(testsDir);

type EnvValue = string | undefined;
type TestEnvName =
  | "ALTERTABLE_API_BASE"
  | "ALTERTABLE_API_KEY"
  | "ALTERTABLE_BASIC_AUTH_TOKEN"
  | "ALTERTABLE_CONFIG_HOME"
  | "ALTERTABLE_ENV"
  | "ALTERTABLE_HTTP_LOG"
  | "ALTERTABLE_LAKEHOUSE_PASSWORD"
  | "ALTERTABLE_LAKEHOUSE_USERNAME"
  | "ALTERTABLE_MANAGEMENT_API_BASE"
  | "ALTERTABLE_MOCK_HTTP_FILE"
  | "ALTERTABLE_PROFILE"
  | "ALTERTABLE_SECRET_BACKEND";
export type TestEnv = Partial<Record<TestEnvName, EnvValue>>;

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
  cleanup: () => Promise<void>;
  resetConfig: () => Promise<void>;
  resetNetwork: () => Promise<void>;
  runCommand: (command: string, options?: RunOptions) => Promise<CommandResult>;
  setupHttpLog: () => Promise<void>;
  setupMockHttp: (mocks: MockHttpResponse[] | string) => Promise<void>;
  clearMockHttp: () => void;
  readFile: (path: string) => Promise<string>;
  writeFile: (name: string, content: string) => Promise<string>;
  appendFile: (path: string, content: string) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
  readHttpLog: () => Promise<string>;
  httpLogValues: (key: string) => Promise<string[]>;
  httpLogValue: (key: string) => Promise<string | undefined>;
  httpLogJsonValue: (key: string) => Promise<unknown>;
  fileMode: (path: string) => Promise<string>;
  chmodFile: (path: string, mode: number) => Promise<void>;
};

const activeWorkspaces = new Set<TestWorkspace>();

export async function resetTestWorkspaceNetwork(): Promise<void> {
  await Promise.all(Array.from(activeWorkspaces, (workspace) => workspace.resetNetwork()));
}

export async function cleanupTestWorkspaces(): Promise<void> {
  await Promise.all(Array.from(activeWorkspaces, (workspace) => workspace.cleanup()));
}

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

  const workspace: TestWorkspace = {
    root,
    configHome,
    configFile,
    credentialsFile,
    defaultProfileConfig,
    async cleanup() {
      activeWorkspaces.delete(workspace);
      await rm(root, { force: true, recursive: true });
    },
    async resetConfig() {
      await rm(configFile, { force: true });
      await rm(credentialsFile, { force: true });
      await rm(join(configHome, "profiles"), { force: true, recursive: true });
    },
    async resetNetwork() {
      delete baseEnv.ALTERTABLE_HTTP_LOG;
      delete baseEnv.ALTERTABLE_MOCK_HTTP_FILE;
      await writeFile(httpLogFile, "");
      await rm(mockHttpFile, { force: true });
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
    async writeFile(name, content) {
      const path = join(root, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      return path;
    },
    async appendFile(path, content) {
      await mkdir(dirname(path), { recursive: true });
      await appendFsFile(path, content);
    },
    async fileExists(path) {
      return await Bun.file(path).exists();
    },
    async readHttpLog() {
      return Bun.file(httpLogFile).text();
    },
    async httpLogValues(key) {
      return readHttpLogValues(httpLogFile, key);
    },
    async httpLogValue(key) {
      return readLastHttpLogValue(httpLogFile, key);
    },
    async httpLogJsonValue(key) {
      const value = await readLastHttpLogValue(httpLogFile, key);
      if (value === undefined) {
        throw new Error(`No ${key}= entry found in HTTP log`);
      }
      return JSON.parse(value);
    },
    async fileMode(path) {
      const info = await stat(path);
      return (info.mode & 0o777).toString(8);
    },
    async chmodFile(path, mode) {
      await chmod(path, mode);
    },
  };

  activeWorkspaces.add(workspace);
  return workspace;
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

async function readHttpLogValues(path: string, key: string): Promise<string[]> {
  const prefix = `${key}=`;
  const log = await Bun.file(path).text();
  return log
    .split("\n")
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
}

async function readLastHttpLogValue(path: string, key: string): Promise<string | undefined> {
  const values = await readHttpLogValues(path, key);
  return values.at(-1);
}
