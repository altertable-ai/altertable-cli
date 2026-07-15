import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBootstrapCliContext } from "@/context.ts";
import {
  activeContextToJson,
  buildActiveContext,
  withAuthenticatedIdentity,
} from "@/features/profile/model.ts";
import {
  buildActiveContextDetailsView,
  buildActiveContextSummaryView,
} from "@/features/profile/views.ts";
import {
  formatActiveContextDetails,
  formatActiveContextSummary,
  tryFormatActiveContextSummary,
} from "@/features/profile/render.ts";
import { configureClearAll, configureRunSet } from "@/lib/profile-configure-core.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

const profileName = "default";

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
    configureClearAll(profileName);
  });
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe("active context formatters", () => {
  test("summary shows profile and credential gaps when unconfigured", async () => {
    await runInTestHome(async () => {
      configureClearAll(profileName);
      const summary = formatActiveContextSummary(buildActiveContext(profileName));
      expect(summary).not.toContain("CONTEXT");
      expect(summary).toContain("PROFILE");
      expect(summary).toMatch(/\n  PROFILE/);
      expect(summary).toContain("not set");
      expect(summary).toContain("altertable profile --configure");
    });
  });

  test("details include authenticated identity when present", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      const context = buildActiveContext(profileName);
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

  test("summary view describes the context as a table", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });

      const view = buildActiveContextSummaryView(buildActiveContext(profileName));
      const [summarySection] = view.sections;
      const [summaryBlock] = summarySection?.blocks ?? [];

      expect(summaryBlock?.kind).toBe("table");
      if (summaryBlock?.kind === "table") {
        expect(summaryBlock.table.columns.map((column) => column.header)).toEqual([
          "PROFILE",
          "ENV",
          "MGMT",
          "LAKEHOUSE",
        ]);
        expect(summaryBlock.table.rows).toEqual([
          {
            profile: "default",
            environment: "production",
            management: "production",
            lakehouse: "not set",
          },
        ]);
        const [entry] = summaryBlock.table.rows;
        expect(summaryBlock.table.columns.map((column) => column.cell(entry))).toEqual([
          [{ text: "default", style: "strong" }],
          [{ text: "production", style: "accent" }],
          [{ text: "production", style: "muted" }],
          [{ text: "not set", style: "muted" }],
        ]);
      }
    });
  });

  test("details view keeps identity and endpoint rows declarative", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      const view = buildActiveContextDetailsView(
        withAuthenticatedIdentity(buildActiveContext(profileName), {
          principal: { type: "User", name: "Alex Doe", email: "alex@example.com" },
          organization: { name: "Acme", slug: "acme" },
        }),
      );
      const [detailSection] = view.sections;
      const [detailBlock] = detailSection?.blocks ?? [];

      expect(detailBlock?.kind).toBe("rows");
      if (detailBlock?.kind === "rows") {
        expect(detailBlock.rows).toEqual(
          expect.arrayContaining([
            { label: "User:", value: "Alex Doe <alex@example.com>" },
            { label: "Organization:", value: "Acme (acme)" },
            {
              label: "Data plane:",
              value: [
                {
                  text: "https://api.altertable.ai",
                  style: "accent",
                  href: "https://api.altertable.ai",
                },
              ],
            },
          ]),
        );
      }
    });
  });

  test("json output keeps principal for scripting compatibility", async () => {
    await runInTestHome(async () => {
      await configureRunSet({ apiKey: "atm_test", env: "production" });
      const context = withAuthenticatedIdentity(buildActiveContext(profileName), {
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
      configureClearAll(profileName);
      const summary = tryFormatActiveContextSummary("staging");
      expect(summary).toContain("PROFILE");
      expect(summary).toContain("staging");
      expect(summary).toContain("not set");
    });
  });
});
