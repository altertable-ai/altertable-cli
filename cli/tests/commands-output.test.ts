import { describe, expect, test } from "bun:test";
import {
  writeCommandOutput,
  writeDeleteSuccess,
  writeJsonOrRaw,
  writeManagementOutput,
} from "@/lib/command-output.ts";
import { formatAutocompleteHumanOutput, writeLakehouseOutput } from "@/lib/lakehouse-client.ts";
import { createCliRuntime, runWithCliRuntime } from "@/lib/runtime.ts";

function captureOutput(json: boolean): {
  stdout: string[];
  stderr: string[];
  runtime: ReturnType<typeof createCliRuntime>;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const runtime = createCliRuntime({ debug: false, json });
  runtime.output.writeStdout = (line) => {
    stdout.push(line);
  };
  runtime.output.writeStderr = (line) => {
    stderr.push(line);
  };
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
  test("raw_api emits verbatim body in json mode", () => {
    const { stdout, runtime } = captureOutput(true);
    runWithCliRuntime(runtime, () => {
      writeCommandOutput({ kind: "raw_api", body: '{"ok":true}' });
    });
    expect(stdout).toEqual(['{"ok":true}']);
  });

  test("normalized emits envelope in json mode", () => {
    const { stdout, runtime } = captureOutput(true);
    runWithCliRuntime(runtime, () => {
      writeCommandOutput({
        kind: "normalized",
        data: { catalogs: [{ name: "db" }] },
        humanText: "table output",
      });
    });
    expect(stdout).toEqual([JSON.stringify({ catalogs: [{ name: "db" }] }, null, 2)]);
  });

  test("human emits text envelope in json mode", () => {
    const { stdout, runtime } = captureOutput(true);
    runWithCliRuntime(runtime, () => {
      writeCommandOutput({ kind: "human", text: "configure show text" });
    });
    expect(stdout).toEqual([JSON.stringify({ text: "configure show text" }, null, 2)]);
  });

  test("deleted emits json success object", () => {
    const { stdout, runtime } = captureOutput(true);
    runWithCliRuntime(runtime, () => {
      writeDeleteSuccess("Deleted item.", "item_1");
    });
    expect(stdout).toEqual([JSON.stringify({ deleted: true, id: "item_1" }, null, 2)]);
  });

  test("tabular defaults to table in human mode", () => {
    const listBody = JSON.stringify({
      databases: [{ id: "db_1", name: "Analytics" }],
    });
    const { stdout, runtime } = captureOutput(false);
    runWithCliRuntime(runtime, () => {
      writeManagementOutput(listBody);
    });
    expect(stdout[0]).toContain("id");
    expect(stdout[0]).toContain("Analytics");
  });
});

describe("writeJsonOrRaw", () => {
  test("writes raw API body in json mode", () => {
    const { stdout, runtime } = captureOutput(true);
    runWithCliRuntime(runtime, () => {
      writeJsonOrRaw('{"principal":{"name":"Jane"}}', (data) => String(data));
    });
    expect(stdout).toEqual(['{"principal":{"name":"Jane"}}']);
  });
});

describe("writeLakehouseOutput", () => {
  test("writes raw API body in json mode", () => {
    const { stdout, runtime } = captureOutput(true);
    runWithCliRuntime(runtime, () => {
      writeLakehouseOutput('{"ok":true}');
    });
    expect(stdout).toEqual(['{"ok":true}']);
  });

  test("calls human formatter when not in json mode", () => {
    const { stdout, runtime } = captureOutput(false);
    runWithCliRuntime(runtime, () => {
      writeLakehouseOutput('{"ok":true}', { humanFormatter: () => "human" });
    });
    expect(stdout).toEqual(["human"]);
  });
});

describe("formatAutocompleteHumanOutput", () => {
  test("prints one suggestion per line", () => {
    const output = formatAutocompleteHumanOutput({
      suggestions: [{ suggestion: "users" }, { suggestion: "orders" }],
      statement: "SELECT * FROM ",
    });
    expect(output).toBe("users\norders");
  });
});
