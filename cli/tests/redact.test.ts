import { describe, expect, test } from "bun:test";
import { MASKED_PASSWORD_PLACEHOLDER, redactPasswordFieldInText } from "@/lib/redact.ts";

describe("redactPasswordFieldInText", () => {
  test("redacts password:value without a space after the colon", () => {
    expect(redactPasswordFieldInText("requested_by=password:secret123")).toBe(
      `requested_by=password: ${MASKED_PASSWORD_PLACEHOLDER}`,
    );
  });

  test("redacts password: value with whitespace after the colon", () => {
    expect(redactPasswordFieldInText("field password: s3cr3t trailing")).toBe(
      `field password: ${MASKED_PASSWORD_PLACEHOLDER} trailing`,
    );
  });

  test("redacts case-insensitive Password labels", () => {
    expect(redactPasswordFieldInText("Password:abc")).toBe(
      `Password: ${MASKED_PASSWORD_PLACEHOLDER}`,
    );
  });
});
