import type { ManagementOutputFormat } from "@/lib/lakehouse-client.ts";
import { renderManagementOutput } from "@/lib/management-output.ts";
import { parseApiJson } from "@/lib/parse-api-json.ts";
import { resolvePagerOptions, writePagedOutput } from "@/lib/pager.ts";
import type { OutputSink } from "@/lib/runtime.ts";
import { span } from "@/ui/document.ts";
import { renderDisplayText } from "@/ui/terminal/styles.ts";

export type CommandOutputMode =
  | { kind: "raw_api"; body: string; humanFormatter?: (data: unknown) => string }
  | {
      kind: "normalized";
      data: unknown;
      humanText: string;
      metadataLines?: string[];
      pageHumanText?: boolean;
    }
  | { kind: "human"; text: string }
  | {
      kind: "tabular";
      body: string;
      format?: ManagementOutputFormat;
      humanFormatter?: (data: unknown) => string;
    }
  | { kind: "deleted"; message: string; id?: string }
  | { kind: "ack"; data: Record<string, unknown>; metadataMessage: string };

export async function writeCommandOutput(mode: CommandOutputMode, sink: OutputSink): Promise<void> {
  const json = sink.json;

  if (mode.kind === "deleted") {
    if (json) {
      sink.writeJson({
        deleted: true,
        ...(mode.id !== undefined ? { id: mode.id } : {}),
      });
      return;
    }
    sink.writeHuman(mode.message);
    return;
  }

  if (mode.kind === "human") {
    if (json) {
      sink.writeJson({ text: mode.text });
      return;
    }
    sink.writeHuman(mode.text);
    return;
  }

  if (mode.kind === "normalized") {
    if (json) {
      sink.writeJson(mode.data);
      return;
    }
    if (mode.pageHumanText) {
      await writePagedOutput(mode.humanText, resolvePagerOptions(), sink);
    } else {
      sink.writeHuman(mode.humanText);
    }
    if (mode.metadataLines !== undefined && mode.metadataLines.length > 0) {
      sink.writeMetadata(mode.metadataLines);
    }
    return;
  }

  if (mode.kind === "ack") {
    if (json) {
      sink.writeJson(mode.data);
      return;
    }
    sink.writeMetadata([renderDisplayText([span(mode.metadataMessage, "subtle")])]);
    return;
  }

  if (mode.kind === "raw_api") {
    if (json) {
      sink.writeRaw(mode.body);
      return;
    }
    if (mode.humanFormatter) {
      sink.writeHuman(mode.humanFormatter(parseApiJson(mode.body)));
      return;
    }
    sink.writeRaw(mode.body);
    return;
  }

  if (mode.kind === "tabular") {
    if (json) {
      sink.writeRaw(mode.body);
      return;
    }
    if (mode.humanFormatter) {
      sink.writeHuman(mode.humanFormatter(parseApiJson(mode.body)));
      return;
    }
    const format = mode.format ?? "table";
    const output = renderManagementOutput(mode.body, format);
    if (format === "table") {
      await writePagedOutput(output, resolvePagerOptions(), sink);
      return;
    }
    sink.writeHuman(output);
    return;
  }
}
