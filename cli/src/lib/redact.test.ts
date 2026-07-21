import { describe, expect, test } from "bun:test";
import {
  MASKED_PASSWORD_PLACEHOLDER,
  redactPasswordFieldInText,
  redactSensitiveJsonText,
} from "@/lib/redact.ts";

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

describe("redactSensitiveJsonText", () => {
  const cases = [
    {
      name: "nested objects inside arrays",
      input: '[{"token":"secret","id":9007199254740993},{"safe":"value"}]',
      expected: '[{"token":"[REDACTED]","id":9007199254740993},{"safe":"value"}]',
    },
    {
      name: "escaped sensitive keys",
      input: '{"pass\\u0077ord":"secret","id":9007199254740993}',
      expected: '{"pass\\u0077ord":"[REDACTED]","id":9007199254740993}',
    },
    {
      name: "structured sensitive values",
      input: '{"client_secret":{"nested":[1,2]},"refresh_token":["a","b"],"safe":{"x":1}}',
      expected: '{"client_secret":"[REDACTED]","refresh_token":"[REDACTED]","safe":{"x":1}}',
    },
    {
      name: "surrounding and structural whitespace",
      input: ' \n { "password" : "secret" , "id" : 9007199254740993 } \t',
      expected: ' \n { "password" : "[REDACTED]" , "id" : 9007199254740993 } \t',
    },
  ] as const;

  for (const { name, input, expected } of cases) {
    test(`redacts ${name} without changing other source text`, () => {
      expect(redactSensitiveJsonText(input)).toBe(expected);
    });
  }

  test("rejects malformed JSON", () => {
    expect(() => redactSensitiveJsonText('{"password":"secret"')).toThrow();
  });
});
