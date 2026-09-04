import { describe, expect, test } from "bun:test";
import type { ProfileInspect, ProfileSummary } from "@/lib/profile/model.ts";
import {
  buildProfileInspectView,
  buildProfileInspectResultView,
  buildProfileListView,
  buildProfileShellExportView,
  profileStatusToJson,
  profileInspectToJson,
} from "@/lib/profile/views.ts";

const profile: ProfileInspect = {
  name: "acme_prod",
  active: true,
  config_file: "/config/profiles/acme_prod/config",
  organization: { slug: "acme", name: "Acme Inc" },
  principal: {},
  environment: "production",
  endpoints: { data_plane: "https://api.example.com" },
  auth: { management: "api_key", lakehouse: "none" },
  status: "configured",
  timestamps: {},
};

describe("profile views", () => {
  test("describes the profile list table", () => {
    const summaries: ProfileSummary[] = [{ name: "acme_prod", active: true }];
    const [section] = buildProfileListView(summaries).sections;
    const [block] = section?.blocks ?? [];

    expect(block?.kind).toBe("table");
    if (block?.kind === "table") {
      expect(block.table.columns.map((column) => column.header)).toEqual([
        "  NAME",
        "ORG",
        "PRINCIPAL",
        "ENV",
        "MGMT",
        "LAKEHOUSE",
        "OAUTH EXPIRES",
        "STATUS",
        "DATA PLANE",
      ]);
      expect(block.table.emptyMessage).toBe("No profiles configured.");
    }
  });

  test("describes profile inspection rows and linked endpoints", () => {
    const [section] = buildProfileInspectView(profile).sections;
    const [block] = section?.blocks ?? [];

    expect(block?.kind).toBe("rows");
    if (block?.kind === "rows") {
      expect(block.rows).toEqual(
        expect.arrayContaining([
          { label: "Profile", value: "acme_prod (active)" },
          { label: "Organization", value: "acme" },
          {
            label: "Data plane",
            value: [
              {
                text: "https://api.example.com",
                style: "accent",
                href: "https://api.example.com",
              },
            ],
          },
        ]),
      );
    }
  });

  test("derives a shell export view from the profile selection", () => {
    expect(buildProfileShellExportView("acme_prod")).toEqual({
      env: { ALTERTABLE_PROFILE: "acme_prod" },
    });
  });

  test.each(["empty", "partial"] as const)(
    "adds actionable next steps to %s profile inspection",
    (status) => {
      const incompleteProfile = { ...profile, status };
      const view = buildProfileInspectResultView(incompleteProfile);

      expect(view.sections.at(-1)?.blocks).toEqual([
        { kind: "text", lines: ["Next steps:", "Run: altertable profile configure"] },
      ]);
      expect(profileInspectToJson(incompleteProfile)).toMatchObject({
        profile: { status },
        next_steps: [expect.stringContaining("--password-stdin")],
      });
    },
  );

  test("omits next steps from configured profile inspection", () => {
    expect(profileInspectToJson(profile)).toMatchObject({ next_steps: [] });
  });

  test("serializes profile status without changing its public shape", () => {
    const json = profileStatusToJson({
      profile,
      verification: {
        profile: profile.name,
        configured: ["management"],
        verified: { management: true, lakehouse: false },
        errors: [],
      },
    });

    expect(json).toMatchObject({
      profile: { name: "acme_prod" },
      verification: { configured: ["management"] },
    });
  });
});
