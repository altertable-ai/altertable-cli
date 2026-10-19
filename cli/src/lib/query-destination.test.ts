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

  test("writes multi-chunk streams incrementally without buffering", async () => {
    const runtime = createCliRuntime({ debug: false, json: false, agent: false });
    const written: Uint8Array[] = [];
    runtime.output.writeBytes = (body) => {
      written.push(body);
    };

    const chunks = [
      new Uint8Array([0x50, 0x41]),
      new Uint8Array([0x52, 0x31]),
      new Uint8Array([0x00, 0xff]),
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    await writeQueryDestination(stream, { sink: runtime.output });

    expect(written).toHaveLength(chunks.length);
    expect(written).toEqual(chunks);
  });

  test("writes multi-chunk streams to a file without loss", async () => {
    const dir = mkdtempSync(join(tmpdir(), "altertable-query-dest-"));
    const path = join(dir, "out.parquet");
    try {
      const chunks = [
        new Uint8Array([0x50, 0x41]),
        new Uint8Array([0x52, 0x31]),
        new Uint8Array([0x00, 0xff]),
      ];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      await writeQueryDestination(stream, { outputPath: path });
      expect(new Uint8Array(readFileSync(path))).toEqual(
        new Uint8Array([0x50, 0x41, 0x52, 0x31, 0x00, 0xff]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test.each(["sync", "async", "cancel-error"])(
    "cancels the source and preserves a failed output write: %s",
    async (mode) => {
      const runtime = createCliRuntime({ debug: false, json: false, agent: false });
      const writeError = new Error("broken pipe");
      runtime.output.writeBytes =
        mode === "async"
          ? async () => {
              throw writeError;
            }
          : () => {
              throw writeError;
            };
      let cancellationReason: unknown;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(1));
        },
        cancel(reason) {
          cancellationReason = reason;
          if (mode === "cancel-error") throw new Error("cancel failed");
        },
      });
      let failure: unknown;
      try {
        await writeQueryDestination(stream, { sink: runtime.output });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBe(writeError);
      expect(cancellationReason).toBe(writeError);
      expect(stream.locked).toBe(false);
    },
  );

  test("cancels the source when opening an output file fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "altertable-query-dest-"));
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(1));
      },
      cancel() {
        canceled = true;
      },
    });
    let failure: unknown;
    try {
      await writeQueryDestination(stream, { outputPath: join(dir, "missing", "out.csv") });
    } catch (error) {
      failure = error;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(failure).toBeInstanceOf(Error);
    expect(canceled).toBe(true);
    expect(stream.locked).toBe(false);
  });
});
