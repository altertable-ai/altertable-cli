import { describe, expect, test } from "bun:test";
import { buildRequestHeaders } from "@/lib/http.ts";

describe("buildRequestHeaders", () => {
  test("omits Authorization when authHeader is empty", () => {
    const headers = buildRequestHeaders({
      method: "POST",
      url: "http://x/oauth/token",
      authHeader: "",
      body: "a=1",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(headers.Authorization).toBeUndefined();
    expect(headers[""]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  test("includes Authorization when present", () => {
    const headers = buildRequestHeaders({
      method: "GET",
      url: "http://x",
      authHeader: "Authorization: Bearer t",
    });
    expect(headers.Authorization).toBe("Bearer t");
  });
});
