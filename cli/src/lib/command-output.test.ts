import { describe, expect, test } from "bun:test";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { createCliRuntime, type OutputSink } from "@/lib/runtime.ts";

function captureOutput(json: boolean): {
  stdout: string[];
  stderr: string[];
  sink: OutputSink;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const sink = createCliRuntime({ debug: false, json, agent: false }).output;
  sink.writeJson = (data) => stdout.push(JSON.stringify(data, null, 2));
  sink.writeRaw = (body) => stdout.push(body);
  sink.writeHuman = (text) => stdout.push(text);
  sink.writeMetadata = (lines) => stderr.push(...lines);
  return { stdout, stderr, sink };
}

describe("writeCommandOutput", () => {
  test("raw_api emits verbatim body in json mode", async () => {
    const { stdout, sink } = captureOutput(true);
    await writeCommandOutput({ kind: "raw_api", body: '{"ok":true}' }, sink);
    expect(stdout).toEqual(['{"ok":true}']);
  });

  test("normalized emits envelope in json mode", async () => {
    const { stdout, sink } = captureOutput(true);
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { catalogs: [{ name: "db" }] },
        humanText: "table output",
      },
      sink,
    );
    expect(stdout).toEqual([JSON.stringify({ catalogs: [{ name: "db" }] }, null, 2)]);
  });

  test("human emits text envelope in json mode", async () => {
    const { stdout, sink } = captureOutput(true);
    await writeCommandOutput({ kind: "human", text: "configure show text" }, sink);
    expect(stdout).toEqual([JSON.stringify({ text: "configure show text" }, null, 2)]);
  });

  test("deleted emits json success object", async () => {
    const { stdout, sink } = captureOutput(true);
    await writeCommandOutput({ kind: "deleted", message: "Deleted item.", id: "item_1" }, sink);
    expect(stdout).toEqual([JSON.stringify({ deleted: true, id: "item_1" }, null, 2)]);
  });

  test("tabular defaults to table in human mode", async () => {
    const body = JSON.stringify({ databases: [{ id: "db_1", name: "Analytics" }] });
    const { stdout, sink } = captureOutput(false);
    await writeCommandOutput({ kind: "tabular", body }, sink);
    expect(stdout[0]).toContain("id");
    expect(stdout[0]).toContain("Analytics");
  });

  test("normalized writes metadata lines in human mode", async () => {
    const { stdout, stderr, sink } = captureOutput(false);
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { catalogs: [], summary: "0 catalogs" },
        humanText: "table output",
        metadataLines: ["", "0 catalogs"],
      },
      sink,
    );
    expect(stdout).toEqual(["table output"]);
    expect(stderr).toEqual(["", "0 catalogs"]);
  });

  test("normalized can opt human output into pager handling", async () => {
    const { stdout, sink } = captureOutput(false);
    await writeCommandOutput(
      {
        kind: "normalized",
        data: { routes: [] },
        humanText: "wide route table",
        pageHumanText: true,
      },
      sink,
    );
    expect(stdout).toEqual(["wide route table"]);
  });

  test("ack emits json data in json mode", async () => {
    const { stdout, sink } = captureOutput(true);
    await writeCommandOutput(
      {
        kind: "ack",
        data: { active_profile: "staging" },
        metadataMessage: "Active profile set to staging.",
      },
      sink,
    );
    expect(stdout).toEqual([JSON.stringify({ active_profile: "staging" }, null, 2)]);
  });

  test("ack writes metadata in human mode", async () => {
    const previousNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    const { stderr, sink } = captureOutput(false);
    await writeCommandOutput(
      {
        kind: "ack",
        data: { active_profile: "staging" },
        metadataMessage: "Active profile set to staging.",
      },
      sink,
    );
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
    expect(stderr).toEqual(["Active profile set to staging."]);
  });
});
