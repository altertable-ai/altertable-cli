import type { OutputSink } from "@/lib/runtime.ts";

export type WriteQueryDestinationOptions = {
  outputPath?: string;
  sink?: OutputSink;
};

async function writeStreamChunks(
  stream: ReadableStream<Uint8Array>,
  writeChunk: (chunk: Uint8Array) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      await writeChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function writeQueryDestination(
  content: string | ReadableStream<Uint8Array>,
  options: WriteQueryDestinationOptions = {},
): Promise<void> {
  const { outputPath, sink } = options;

  if (typeof content === "string") {
    const bytes = new TextEncoder().encode(content.endsWith("\n") ? content : `${content}\n`);
    if (outputPath !== undefined) {
      await Bun.write(outputPath, bytes);
      return;
    }
    if (sink) {
      await sink.writeBytes(bytes);
      return;
    }
    await Bun.write(Bun.stdout, bytes);
    return;
  }

  if (outputPath !== undefined) {
    const writer = Bun.file(outputPath).writer();
    try {
      await writeStreamChunks(content, async (chunk) => {
        await writer.write(chunk);
      });
    } finally {
      await writer.end();
    }
    return;
  }

  if (sink) {
    await writeStreamChunks(content, (chunk) => sink.writeBytes(chunk));
    return;
  }

  await writeStreamChunks(content, async (chunk) => {
    await Bun.write(Bun.stdout, chunk);
  });
}
