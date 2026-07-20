import { describe, expect, test } from "bun:test";
import { ParseError } from "@/lib/errors.ts";
import { parseWhoamiResponse } from "@/lib/management/model.ts";

const VALID_WHOAMI = {
  principal: {
    id: "user-1",
    type: "User" as const,
    name: "Jane",
    email: "jane@example.com",
  },
  organization: {
    id: "org-1",
    name: "Acme",
    slug: "acme",
  },
  authentication_scope: "user",
  environment_slug: "production",
};

describe("parseWhoamiResponse", () => {
  test("parses the required management identity shape", () => {
    expect(parseWhoamiResponse(JSON.stringify(VALID_WHOAMI))).toEqual(VALID_WHOAMI);
  });

  test("rejects invalid JSON and missing required fields", () => {
    expect(() => parseWhoamiResponse("not-json")).toThrow(ParseError);
    expect(() => parseWhoamiResponse("{}")).toThrow(
      "Management identity response has an invalid shape",
    );
    expect(() =>
      parseWhoamiResponse(
        JSON.stringify({
          ...VALID_WHOAMI,
          principal: { type: "User", name: "Jane" },
        }),
      ),
    ).toThrow("Management identity response has an invalid shape");
  });
});
