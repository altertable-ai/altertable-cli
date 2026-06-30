import { describe, expect, test } from "bun:test";
import {
  writeCommandOutput,
  writeDeleteSuccess,
  writeJsonOrRaw,
  writeManagementOutput,
} from "@/lib/command-output.ts";
import { writeLakehouseOutput } from "@/lib/lakehouse-client.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

function captureOutput(json: boolean): {
  stdout: string[];
  stderr: string[];
  runtime: ReturnType<typeof createCliRuntime>;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const runtime = createCliRuntime({ debug: false, json, agent: false });
  runtime.output.writeJson = (data) => {
    stdout.push(JSON.stringify(data, null, 2));
  };
  runtime.output.writeRaw = (body) => {
    stdout.push(body);
  };
  runtime.output.writeHuman = (text) => {
    stdout.push(text);
  };
  runtime.output.writeMetadata = (lines) => {
    stderr.push(...lines);
  };
  return { stdout, stderr, runtime };
}

describe("writeCommandOutput", () => {
  test("raw_api emits verbatim body in json mode", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeCommandOutput({ kind: "raw_api", body: '{"ok":true}' });
    });
    expect(stdout).toEqual(['{"ok":true}']);
  });

  test("normalized emits envelope in json mode", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeCommandOutput({
        kind: "normalized",
        data: { catalogs: [{ name: "db" }] },
        humanText: "table output",
      });
    });
    expect(stdout).toEqual([JSON.stringify({ catalogs: [{ name: "db" }] }, null, 2)]);
  });

  test("human emits text envelope in json mode", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeCommandOutput({ kind: "human", text: "configure show text" });
    });
    expect(stdout).toEqual([JSON.stringify({ text: "configure show text" }, null, 2)]);
  });

  test("deleted emits json success object", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeDeleteSuccess("Deleted item.", "item_1");
    });
    expect(stdout).toEqual([JSON.stringify({ deleted: true, id: "item_1" }, null, 2)]);
  });

  test("tabular defaults to table in human mode", async () => {
    const listBody = JSON.stringify({
      databases: [{ id: "db_1", name: "Analytics" }],
    });
    const { stdout, runtime } = captureOutput(false);
    await runWithCliRuntime(runtime, async () => {
      await writeManagementOutput(listBody);
    });
    expect(stdout[0]).toContain("id");
    expect(stdout[0]).toContain("Analytics");
  });

  test("normalized writes metadata lines in human mode", async () => {
    const { stdout, stderr, runtime } = captureOutput(false);
    await runWithCliRuntime(runtime, async () => {
      await writeCommandOutput({
        kind: "normalized",
        data: { catalogs: [], summary: "0 catalogs" },
        humanText: "table output",
        metadataLines: ["", "0 catalogs"],
      });
    });
    expect(stdout).toEqual(["table output"]);
    expect(stderr).toEqual(["", "0 catalogs"]);
  });

  test("ack emits json data in json mode", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeCommandOutput({
        kind: "ack",
        data: { active_profile: "staging" },
        metadataMessage: "Active profile set to staging.",
      });
    });
    expect(stdout).toEqual([JSON.stringify({ active_profile: "staging" }, null, 2)]);
  });

  test("ack writes metadata in human mode", async () => {
    const previousNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    const { stderr, runtime } = captureOutput(false);
    await runWithCliRuntime(runtime, async () => {
      await writeCommandOutput({
        kind: "ack",
        data: { active_profile: "staging" },
        metadataMessage: "Active profile set to staging.",
      });
    });
    if (previousNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previousNoColor;
    }
    expect(stderr).toEqual(["Active profile set to staging."]);
  });
});

describe("writeJsonOrRaw", () => {
  test("writes raw API body in json mode", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeJsonOrRaw('{"principal":{"name":"Jane"}}', (data) => String(data));
    });
    expect(stdout).toEqual(['{"principal":{"name":"Jane"}}']);
  });
});

describe("writeLakehouseOutput", () => {
  test("writes raw API body in json mode", async () => {
    const { stdout, runtime } = captureOutput(true);
    await runWithCliRuntime(runtime, async () => {
      await writeLakehouseOutput('{"ok":true}');
    });
    expect(stdout).toEqual(['{"ok":true}']);
  });

  test("calls human formatter when not in json mode", async () => {
    const { stdout, runtime } = captureOutput(false);
    await runWithCliRuntime(runtime, async () => {
      await writeLakehouseOutput('{"ok":true}', { humanFormatter: () => "human" });
    });
    expect(stdout).toEqual(["human"]);
  });
});
