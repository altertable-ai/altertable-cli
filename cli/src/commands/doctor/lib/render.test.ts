import { describe, expect, test } from "bun:test";
import { formatDoctorReport } from "@/commands/doctor/lib/render.ts";

describe("formatDoctorReport", () => {
  test("renders structured failure status and details", () => {
    const output = formatDoctorReport({
      healthy: false,
      profile: "default",
      summary: { passed: 0, warnings: 0, failed: 1, skipped: 0 },
      checks: [
        {
          id: "management.api",
          label: "Management API",
          status: "fail",
          message: "Authentication failed.",
          code: "auth_failed",
          http_status: 401,
          details: "Token expired",
        },
      ],
    });

    expect(output).toContain("HTTP status: 401");
    expect(output).toContain("Details: Token expired");
  });
});
