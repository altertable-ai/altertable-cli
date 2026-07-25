import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeQueryDestination } from "@/lib/query-destination.ts";
import { createCliRuntime } from "@/lib/runtime.ts";

describe("writeQueryDestination", () => {
  test("writes opaque stdout bytes without UTF-8 round-trip or trailing newline", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const written: Uint8Array[] = [];
    runtime.output.writeBytes = (body) => {
      written.push(body);
    };

    const parquetLike = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0xff]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(parquetLike);
        controller.close();
      },
    });

    await writeQueryDestination(stream, { sink: runtime.output });

    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(parquetLike);
  });

  test("writes opaque file bytes unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "altertable-query-dest-"));
    const path = join(dir, "out.parquet");
    try {
      const parquetLike = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0xff]);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(parquetLike);
          controller.close();
        },
      });

      await writeQueryDestination(stream, { outputPath: path });
      expect(new Uint8Array(readFileSync(path))).toEqual(parquetLike);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
