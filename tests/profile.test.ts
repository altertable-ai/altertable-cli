import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestWorkspace, type TestWorkspace } from "./helpers.ts";

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
    let result = await workspace.runCommand("altertable profile show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acme_staging");
    expect(result.stdout).toContain("staging");

    result = await workspace.runCommand("altertable --profile acme_production profile show");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("acme_production");
    expect(result.stdout).toContain("production");
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

  // `_from_env` names a real identity only while env config is in effect. With
  // no env vars set it resolves to nothing, so reading it must 404 rather than
  // render a fake empty view.
  test("show and status reject _from_env when no env configuration is set", async () => {
    const shown = await workspace.runCommand("altertable profile show --name _from_env");
    expect(shown.exitCode).not.toBe(0);
    expect(shown.stderr).toContain("Profile not found: _from_env");

    const status = await workspace.runCommand("altertable profile status --name _from_env");
    expect(status.exitCode).not.toBe(0);
    expect(status.stderr).toContain("Profile not found: _from_env");
  });

  // Env configuration pins the identity to `_from_env`, so profile-mutating
  // commands are refused — they would only mutate stored state the env overrides.
  // The refusal lists the currently configured env vars (secrets masked).
  test("env configuration disables login and profile-mutating commands", async () => {
    const login = await workspace.runCommand("altertable login", {
      env: { ALTERTABLE_API_KEY: "atm_env" },
    });
    expect(login.exitCode).not.toBe(0);
    expect(login.stderr).toContain(
      "Profile management commands aren't available when configuring through environment variables",
    );
    expect(login.stderr).toContain("ALTERTABLE_API_KEY");
    expect(login.stderr).toContain("set (hidden)");

    const use = await workspace.runCommand("altertable profile use acme_staging", {
      env: { ALTERTABLE_API_KEY: "atm_env" },
    });
    expect(use.exitCode).not.toBe(0);
    expect(use.stderr).toContain("aren't available when configuring through environment variables");

    const created = await workspace.runCommand("altertable profile create globex --api-key atm_x --env dev", {
      env: { ALTERTABLE_ENV: "staging" },
    });
    expect(created.exitCode).not.toBe(0);
    expect(created.stderr).toContain("aren't available when configuring through environment variables");
    expect(created.stderr).toContain("ALTERTABLE_ENV");

    const switched = await workspace.runCommand("altertable profile switch acme_staging", {
      env: { ALTERTABLE_LAKEHOUSE_USERNAME: "u", ALTERTABLE_LAKEHOUSE_PASSWORD: "p" },
    });
    expect(switched.exitCode).not.toBe(0);
    expect(switched.stderr).toContain("aren't available when configuring through environment variables");
  });
});

async function seedAcmeProfiles(workspace: TestWorkspace): Promise<void> {
  expect((await workspace.runCommand("altertable profile create acme_staging --api-key atm_staging --env staging")).exitCode).toBe(0);
  expect((await workspace.runCommand("altertable profile create acme_production --api-key atm_prod --env production")).exitCode).toBe(0);
}
