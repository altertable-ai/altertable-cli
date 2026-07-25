import type { OutputSink } from "@/lib/runtime.ts";

export type WriteQueryDestinationOptions = {
  outputPath?: string;
  sink?: OutputSink;
};

async function collectStreamBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function writeQueryDestination(
  content: string | ReadableStream<Uint8Array>,
  options: WriteQueryDestinationOptions = {},
): Promise<void> {
  const { outputPath, sink } = options;
  const bytes =
    typeof content === "string"
      ? new TextEncoder().encode(content.endsWith("\n") ? content : `${content}\n`)
      : await collectStreamBytes(content);

  if (outputPath !== undefined) {
    await Bun.write(outputPath, bytes);
    return;
  }

  if (sink) {
    await sink.writeBytes(bytes);
    return;
  }

  await Bun.write(Bun.stdout, bytes);
}
