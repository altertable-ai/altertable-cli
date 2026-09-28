import { describe, expect, test } from "bun:test";
import { startAppDevProxy } from "@/commands/app/lib/dev-proxy.ts";
import type { ExecutionContext } from "@/lib/execution-context.ts";
import type { sendHttpStream } from "@/lib/http-request.ts";

describe("data app dev proxy", () => {
  test("keeps credentials in the CLI and accepts only authenticated query requests", async () => {
    const calls: string[] = [];
    const send: typeof sendHttpStream = async (request) => {
      calls.push(request.body as string);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"query_id":"q1"}\n'));
          controller.close();
        },
      });
    };
    const proxy = startAppDevProxy({ profile: "test" } as ExecutionContext, send);
    try {
      expect(proxy.environment).not.toHaveProperty("ALTERTABLE_LAKEHOUSE_USERNAME");
      expect(proxy.environment).not.toHaveProperty("ALTERTABLE_LAKEHOUSE_PASSWORD");
      const url = `${proxy.environment.ALTERTABLE_DATA_PROXY_URL}/query`;
      expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(401);
      expect(calls).toHaveLength(0);
      const headers = { authorization: `Bearer ${proxy.environment.ALTERTABLE_DATA_PROXY_TOKEN}` };
      expect((await fetch(url, { method: "GET", headers })).status).toBe(404);
      expect(calls).toHaveLength(0);
      const response = await fetch(url, { method: "POST", headers, body: "{}" });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('{"query_id":"q1"}\n');
      expect(calls).toEqual(["{}"]);
    } finally {
      await proxy.stop();
    }
  });
});
