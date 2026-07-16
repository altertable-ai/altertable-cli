import { describe, expect, test } from "bun:test";
import { buildCreateCatalogBody } from "@/lib/management-payloads.ts";

describe("management payload builders", () => {
  test("buildCreateCatalogBody includes altertable engine", () => {
    const body = buildCreateCatalogBody({ name: "My Cat" });
    expect(JSON.parse(body)).toEqual({ name: "My Cat", engine: "altertable" });
  });
});
