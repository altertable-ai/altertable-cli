import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";
import { whoamiMock } from "./mock-http.ts";

describe("profile switching", () => {
  let workspace: TestWorkspace;

  beforeAll(async () => {
    workspace = await createTestWorkspace({ ALTERTABLE_API_KEY: undefined, ALTERTABLE_ENV: undefined });
  });

  beforeEach(async () => {
    await seedAcmeProfiles(workspace);
  });

  test("profile list shows configured org/env profiles", async () => {
    const result = await workspace.runCommand("altertable profile list");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acme_staging");
    expect(result.stdout).toContain("acme_production");
    expect(result.stdout).toContain("acme");
  });

  test("profile use and current update active profile", async () => {
    expect((await workspace.runCommand("altertable profile use acme_staging")).exitCode).toBe(0);
    const result = await workspace.runCommand("altertable profile current");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("acme_staging");
  });

  test("active profile and --profile flag select different identities", async () => {
    expect((await workspace.runCommand("altertable profile use acme_staging")).exitCode).toBe(0);
    await workspace.setupMockHttp(whoamiMock({ type: "User", name: "Staging", email: "s@x.io" }));
    let result = await workspace.runCommand("altertable profile show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Staging");

    await workspace.setupMockHttp(whoamiMock({ type: "User", name: "Production", email: "p@x.io" }));
    result = await workspace.runCommand("altertable --profile acme_production profile show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Production");
  });

  test("rename carries the active profile", async () => {
    expect((await workspace.runCommand("altertable profile use acme_staging")).exitCode).toBe(0);
    expect((await workspace.runCommand("altertable profile rename acme_staging acme_stage")).exitCode).toBe(0);
    const result = await workspace.runCommand("altertable profile current");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("acme_stage");
  });

  test("profile create, status, env, direnv, and delete cover metadata workflows", async () => {
    expect((await workspace.runCommand("altertable profile create globex_dev --api-key atm_globex --env dev")).exitCode).toBe(0);
    let result = await workspace.runCommand("altertable profile status --name globex_dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("globex_dev");
    expect(result.stdout).toContain("Management:");

    result = await workspace.runCommand("altertable profile env globex_dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('export ALTERTABLE_PROFILE="globex_dev"');

    result = await workspace.runCommand("altertable profile direnv globex_dev");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('export ALTERTABLE_PROFILE="globex_dev"');

    expect((await workspace.runCommand("altertable profile use acme_staging")).exitCode).toBe(0);
    result = await workspace.runCommand("altertable profile delete globex_dev --yes");
    expect(result.exitCode).toBe(0);
    result = await workspace.runCommand("altertable profile list");
    expect(result.stdout).not.toContain("globex_dev");
  });

  // Environment credentials pin the identity to `_from_env`, so login and profile
  // switching are disabled — they would only mutate stored state the env overrides.
  test("environment credentials disable login and profile switching", async () => {
    const login = await workspace.runCommand("altertable login", {
      env: { ALTERTABLE_API_KEY: "atm_env" },
    });
    expect(login.exitCode).not.toBe(0);
    expect(login.stderr).toContain("disabled while credentials come from the environment");

    const use = await workspace.runCommand("altertable profile use acme_staging", {
      env: { ALTERTABLE_API_KEY: "atm_env" },
    });
    expect(use.exitCode).not.toBe(0);
    expect(use.stderr).toContain("disabled while credentials come from the environment");

    const switched = await workspace.runCommand("altertable profile switch acme_staging", {
      env: { ALTERTABLE_LAKEHOUSE_USERNAME: "u", ALTERTABLE_LAKEHOUSE_PASSWORD: "p" },
    });
    expect(switched.exitCode).not.toBe(0);
    expect(switched.stderr).toContain("disabled while credentials come from the environment");
  });
});

async function seedAcmeProfiles(workspace: TestWorkspace): Promise<void> {
  expect((await workspace.runCommand("altertable profile create acme_staging --api-key atm_staging --env staging")).exitCode).toBe(0);
  expect((await workspace.runCommand("altertable profile create acme_production --api-key atm_prod --env production")).exitCode).toBe(0);
}
