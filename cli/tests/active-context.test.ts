import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBootstrapCliContext } from "@/context.ts";
import {
  activeContextToJson,
  buildActiveContext,
  formatActiveContextDetails,
  formatActiveContextSummary,
  tryFormatActiveContextSummary,
  withAuthenticatedIdentity,
} from "@/lib/active-context.ts";
import { configureClearAll, configureRunSet } from "@/lib/configure.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

let testHome = "";

function runInTestHome<T>(run: () => T | Promise<T>): T | Promise<T> {
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = "file";
  delete process.env.ALTERTABLE_API_KEY;
  delete process.env.ALTERTABLE_ENV;
  delete process.env.ALTERTABLE_BASIC_AUTH_TOKEN;
  delete process.env.ALTERTABLE_LAKEHOUSE_USERNAME;
  delete process.env.ALTERTABLE_LAKEHOUSE_PASSWORD;

  const runtime = createCliRuntime(getBootstrapCliContext());
  return runWithCliRuntime(runtime, run);
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "altertable-active-context-test-"));
});

afterEach(async () => {
  await runInTestHome(async () => {
    configureClearAll();
  });
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("active context formatters", () => {
  test("summary shows profile and credential gaps when unconfigured", async () => {
    await runInTestHome(async () => {
      configureClearAll();
      const summary = formatActiveContextSummary(buildActiveContext());
      expect(summary).not.toContain("CONTEXT");
      expect(summary).toContain("PROFILE");
      expect(summary).toMatch(/\n  PROFILE/);
      expect(summary).toContain("not set");
      expect(summary).toContain("altertable configure");
    });
  });

  test("details include authenticated identity when present", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      const context = buildActiveContext();
      const details = formatActiveContextDetails(
        withAuthenticatedIdentity(context, {
          principal: { type: "User", name: "Jane Doe", email: "jane@x.io" },
          organization: { name: "Acme", slug: "acme" },
        }),
      );
      expect(details).not.toContain("CONTEXT\n");
      expect(details).toContain("Profile:");
      expect(details).toContain("Environment:");
      expect(details).toContain("production");
      expect(details).toContain("Jane Doe <jane@x.io>");
      expect(details).toContain("Acme (acme)");
    });
  });

  test("json output keeps principal for scripting compatibility", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      const context = withAuthenticatedIdentity(buildActiveContext(), {
        principal: { type: "User", name: "Jane Doe", email: "jane@x.io" },
        organization: { name: "Acme", slug: "acme" },
      });
      const json = activeContextToJson(context);
      expect(json.profile).toBe("default");
      expect(json.environment).toBe("production");
      expect((json.principal as { email?: string }).email).toBe("jane@x.io");
    });
  });

  test("tryFormatActiveContextSummary renders an empty profile", async () => {
    await runInTestHome(async () => {
      configureClearAll();
      const summary = tryFormatActiveContextSummary("staging");
      expect(summary).toContain("PROFILE");
      expect(summary).toContain("staging");
      expect(summary).toContain("not set");
    });
  });
});
