import { describe, expect, test } from "bun:test";
import type { ProfileInspect } from "@/lib/profile/model.ts";
import { formatProfileInspectResult, formatProfileStatus } from "@/lib/profile/render.ts";

const profile: ProfileInspect = {
  name: "acme_prod",
  active: true,
  config_file: "/config/profiles/acme_prod/config",
  organization: { slug: "acme" },
  principal: {},
  environment: "production",
  endpoints: {},
  auth: { management: "api_key", lakehouse: "none" },
  status: "configured",
  timestamps: {},
};

describe("profile rendering", () => {
  test("renders stored profile details without exposing credentials", () => {
    const output = formatProfileInspectResult(profile);

    expect(output).toContain("Management auth");
    expect(output).toContain("api_key");
    expect(output).toContain("Environment");
    expect(output).toContain("production");
    expect(output).toContain("Config file");
  });

  test("renders verification alongside profile details", () => {
    const output = formatProfileStatus({
      profile,
      verification: {
        profile: profile.name,
        configured: ["management"],
        verified: { management: true, lakehouse: false },
        errors: [],
      },
    });

    expect(output).toContain("Management auth");
    expect(output).toContain("Verification:");
    expect(output).toContain("Management:");
    expect(output).toContain("verified");
  });

  test("renders guidance for an empty profile", () => {
    const output = formatProfileInspectResult({ ...profile, status: "empty" });

    expect(output).toContain("Next steps:");
    expect(output).toContain("altertable profile configure");
  });
});
