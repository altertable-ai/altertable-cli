import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCommandWithTestRuntime } from "@/test-utils/cli.ts";
import {
  createLakehouseTestWorkspace,
  type LakehouseTestWorkspace,
} from "@/test-utils/lakehouse.ts";

let workspace: LakehouseTestWorkspace;
let directory: string;

beforeEach(() => {
  workspace = createLakehouseTestWorkspace("app-command");
  directory = workspace.createDirectory("app");
  workspace.writeFile(
    "app/package.json",
    JSON.stringify({
      scripts: {
        typecheck: "bun capture.ts typecheck",
        dev: "bun capture.ts dev",
        build: "bun capture.ts build",
      },
    }),
  );
  workspace.writeFile(
    "app/capture.ts",
    `import { writeFileSync } from "node:fs";
writeFileSync(import.meta.dir + "/" + process.argv[2] + ".json", JSON.stringify({
  username: process.env.ALTERTABLE_LAKEHOUSE_USERNAME,
  password: process.env.ALTERTABLE_LAKEHOUSE_PASSWORD,
  token: process.env.ALTERTABLE_BASIC_AUTH_TOKEN,
  apiKey: process.env.ALTERTABLE_API_KEY,
  apiBase: process.env.ALTERTABLE_API_BASE,
  proxyUrl: process.env.ALTERTABLE_DATA_PROXY_URL,
  proxyToken: process.env.ALTERTABLE_DATA_PROXY_TOKEN,
  port: process.env.PORT,
}));`,
  );
});

afterEach(() => {
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  delete process.env.ALTERTABLE_API_KEY;
  workspace.cleanup();
});

function captured(script: "typecheck" | "dev" | "build"): Record<string, string> {
  return JSON.parse(readFileSync(join(directory, `${script}.json`), "utf8"));
}

function runAppCommand(args: string[]) {
  return runCommandWithTestRuntime(args, { debug: false, json: false, agent: false });
}

describe("app commands", () => {
  test("dev gives the app only a loopback proxy without blocking on lakehouse access", async () => {
    workspace.writeMocks([
      { urlPattern: "/query", method: "POST", status: 500, body: "temporary failure" },
    ]);
    const result = await runAppCommand(["app", "dev", "--dir", directory]);

    expect(result.exitCode).toBe(0);
    const dev = captured("dev");
    expect(dev.username).toBeUndefined();
    expect(dev.password).toBeUndefined();
    expect(dev.apiBase).toBeUndefined();
    expect(dev.proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(dev.proxyToken).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(directory, "typecheck.json"))).toBe(false);
  });

  test("dev passes a validated port only to the dev server", async () => {
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: '{"ok":true}' }]);

    const result = await runAppCommand(["app", "dev", "--dir", directory, "--port", "3022"]);

    expect(result.exitCode).toBe(0);
    expect(captured("dev").port).toBe("3022");
    expect(existsSync(join(directory, "typecheck.json"))).toBe(false);
  });

  test("dev rejects invalid ports before installing dependencies", () => {
    for (const port of ["0", "65536", "-1", "abc", "3000.5", "03000"]) {
      expect(runAppCommand(["app", "dev", "--dir", directory, "--port", port])).rejects.toThrow(
        "--port must be an integer from 1 to 65535",
      );
    }
    expect(existsSync(join(directory, "typecheck.json"))).toBe(false);
  });

  test("build does not pass Altertable credentials to the bundler", async () => {
    process.env.ALTERTABLE_BASIC_AUTH_TOKEN = Buffer.from("testuser:testpass").toString("base64");
    process.env.ALTERTABLE_API_KEY = "management-secret";

    const result = await runAppCommand(["app", "build", "--dir", directory]);

    expect(result.exitCode).toBe(0);
    expect(captured("build")).toEqual({});
    expect(captured("typecheck")).toEqual({});
  });

  test("requires the selected script before launching Bun", async () => {
    workspace.writeFile(
      "app/package.json",
      JSON.stringify({ scripts: { typecheck: "bun capture.ts typecheck", dev: "bun capture.ts" } }),
    );

    expect(runAppCommand(["app", "build", "--dir", directory])).rejects.toThrow(
      'needs a "build" script',
    );
  });

  test("validates a dev project before starting the proxy", async () => {
    workspace.writeFile(
      "app/package.json",
      JSON.stringify({ scripts: { typecheck: "bun capture.ts typecheck" } }),
    );

    expect(runAppCommand(["app", "dev", "--dir", directory])).rejects.toThrow(
      'needs a "dev" script',
    );
  });

  test("rejects structured output for inherited app script output", async () => {
    expect(
      runCommandWithTestRuntime(["app", "build", "--dir", directory], {
        debug: false,
        json: true,
        agent: false,
      }),
    ).rejects.toThrow("cannot use --json or --agent");
  });

  test("starts dev without typechecking and stops build when typechecking fails", async () => {
    workspace.writeFile(
      "app/package.json",
      JSON.stringify({
        scripts: { typecheck: "exit 2", dev: "bun capture.ts dev", build: "bun capture.ts build" },
      }),
    );
    workspace.writeMocks([{ urlPattern: "/query", method: "POST", body: '{"ok":true}' }]);

    const dev = await runAppCommand(["app", "dev", "--dir", directory]);
    expect(dev.exitCode).toBe(0);
    expect(existsSync(join(directory, "dev.json"))).toBe(true);

    const build = await runAppCommand(["app", "build", "--dir", directory]);
    expect(build.exitCode).toBe(1);
    expect(existsSync(join(directory, "build.json"))).toBe(false);
  });
});
