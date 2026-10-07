import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import {
  createAppFiles,
  dataAppDirectory,
  readDataAppPayload,
  starterFiles,
} from "@/commands/app/lib/distribution.ts";
import { recommendedDataAppVersion } from "@/commands/app/lib/package.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("distribution embeds a deterministic starter with an exact package pin and no runtime", async () => {
  const payload = await readDataAppPayload();
  expect(await readDataAppPayload()).toEqual(payload);
  expect(Object.keys(payload)).toEqual(["starter"]);
  expect(Object.keys(payload.starter)).toContain("src/App.tsx");
  for (const path of Object.keys(payload.starter)) {
    expect(path).not.toMatch(/(^|\/)(tests|fixtures|node_modules|dist|\.altertable)(\/|$)|\.txt$/);
  }
  const identity = {
    name: "example",
    title: 'A "quoted" title',
    scope: { organization: "<script>& {{APP_TITLE}}", environment: "test\nteam" },
  };
  const files = createAppFiles(payload, identity);
  expect(JSON.parse(files["app.json"]!)).toMatchObject({
    title: identity.title,
    scope: identity.scope,
  });
  expect(JSON.parse(files["package.json"]!).dependencies["@altertable/data-app"]).toBe(
    recommendedDataAppVersion(),
  );
  expect(files["src/App.tsx"]).toBe(payload.starter["src/App.tsx"]);
  expect(files["src/server.ts"]).toContain("@altertable/data-app/server/bun");
  expect(files["src/main.tsx"]).toContain("injectDataAppStyles();");
  expect(files["bun.lock"]).toContain('"name": "example"');
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "starter-distribution-"));
  directories.push(directory);
  for (const name of starterFiles)
    await cp(join(dataAppDirectory, "starter", name), join(directory, name), { recursive: true });
  return directory;
}

test("distribution rejects symlinks and development artifacts inside starter source", async () => {
  const directory = await fixture();
  await symlink(join(directory, "package.json"), join(directory, "src/link.ts"));
  // The payload root owns a starter directory; keep its allowlist identical to production.
  const root = await mkdtemp(join(tmpdir(), "starter-payload-"));
  directories.push(root);
  await cp(directory, join(root, "starter"), { recursive: true, dereference: false });
  expect(readDataAppPayload(root)).rejects.toThrow("Symlink");
  await rm(join(root, "starter/src/link.ts"));
  await writeFile(join(root, "starter/src/probe.test.ts"), "test artifact");
  expect(readDataAppPayload(root)).rejects.toThrow("Development artifact");
});

test("app-owned authoring links resolve within the generated files", async () => {
  const files = createAppFiles(await readDataAppPayload(), {
    name: "docs-test",
    title: "Docs",
    scope: { organization: "Test", environment: "test" },
  });
  expect(files["AGENTS.md"]).toContain(
    "https://github.com/altertable-ai/data-app/blob/v0.66.0/AGENTS.md",
  );
  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith(".md")) continue;
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]!.split("#")[0]!;
      if (!target || /^[a-z]+:\/\//i.test(target)) continue;
      const path = posix.normalize(posix.join(posix.dirname(name), target));
      // Package documentation is validated after installation in the app creation test.
      if (path.startsWith("node_modules/@altertable/data-app/")) continue;
      expect(files[path], `${name} links to missing ${path}`).toBeDefined();
    }
  }
});
