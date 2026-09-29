import { expect, test } from "bun:test";
import { assertAppScope } from "@/commands/app/lib/scope.ts";

test("live apps require the selected organization and environment before querying", () => {
  const profile = { organization: "acme", organizationName: "Acme", environment: "production" };
  for (const organization of ["acme", "Acme"]) {
    expect(() =>
      assertAppScope({ organization, environment: "production" }, profile),
    ).not.toThrow();
  }
  for (const scope of [
    undefined,
    {},
    { organization: "other", environment: "production" },
    { organization: "Acme", environment: "staging" },
  ]) {
    expect(() => assertAppScope(scope, profile)).toThrow("does not match");
  }
});

test("environment-only credentials verify only the scope metadata they provide", () => {
  const scope = { organization: "acme", environment: "production" };
  expect(() => assertAppScope(scope, {})).not.toThrow();
  expect(() => assertAppScope(scope, { environment: "staging" })).toThrow("does not match");
});
