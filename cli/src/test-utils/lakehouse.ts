import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setCliContext } from "@/context.ts";
import { getCliRuntime, refreshCliRuntimeContext } from "@/lib/runtime.ts";

export type MockHttpResponse = {
  urlPattern: string;
  method?: string;
  status?: number;
  body: string;
  chunked?: boolean;
};

export type LakehouseTestWorkspace = {
  home: string;
  writeMocks(responses: MockHttpResponse[]): void;
  writeFile(name: string, content: string): string;
  createDirectory(name: string): string;
  readHttpLog(): string;
  readPayloads(): string[];
  cleanup(): void;
};

export function createLakehouseTestWorkspace(name: string): LakehouseTestWorkspace {
  const home = mkdtempSync(join(tmpdir(), `altertable-${name}-test-`));
  const mockFile = join(home, "mocks.json");
  const logFile = join(home, "http.log");
  process.env.ALTERTABLE_MOCK_HTTP_FILE = mockFile;
  process.env.ALTERTABLE_HTTP_LOG = logFile;
  process.env.ALTERTABLE_API_BASE = "https://example.com";
  process.env.ALTERTABLE_LAKEHOUSE_USERNAME = "testuser";
  process.env.ALTERTABLE_LAKEHOUSE_PASSWORD = "testpass";
  setCliContext({ debug: false, json: false, agent: false });
  refreshCliRuntimeContext(getCliRuntime().context);

  return {
    home,
    writeMocks(responses) {
      writeFileSync(mockFile, JSON.stringify(responses));
    },
    writeFile(fileName, content) {
      const path = join(home, fileName);
      writeFileSync(path, content);
      return path;
    },
    createDirectory(directoryName) {
      const path = join(home, directoryName);
      mkdirSync(path);
      return path;
    },
    readHttpLog() {
      return readFileSync(logFile, "utf8");
    },
    readPayloads() {
      return readFileSync(logFile, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("PAYLOAD="))
        .map((line) => line.slice("PAYLOAD=".length));
    },
    cleanup() {
      rmSync(home, { recursive: true, force: true });
      delete process.env.ALTERTABLE_MOCK_HTTP_FILE;
      delete process.env.ALTERTABLE_HTTP_LOG;
      delete process.env.ALTERTABLE_API_BASE;
      delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
      delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;
    },
  };
}
