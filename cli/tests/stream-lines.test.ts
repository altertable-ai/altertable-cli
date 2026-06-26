import { describe, expect, test } from "bun:test";
import { readTextStreamLines } from "@/lib/stream-lines.ts";

async function collectLines(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of readTextStreamLines(stream)) {
    lines.push(line);
  }
  return lines;
}

describe("readTextStreamLines", () => {
  test("splits lines across chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("line1\nline"));
        controller.enqueue(encoder.encode("2\nline3"));
        controller.close();
      },
    });

    expect(await collectLines(stream)).toEqual(["line1", "line2", "line3"]);
  });

  test("handles CRLF line endings", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("a\r\nb\r\n"));
        controller.close();
      },
    });

    expect(await collectLines(stream)).toEqual(["a", "b"]);
  });

  test("buffers incomplete line until newline arrives", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("partial"));
        controller.enqueue(encoder.encode("-line\n"));
        controller.close();
      },
    });

    expect(await collectLines(stream)).toEqual(["partial-line"]);
  });
});
