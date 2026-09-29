import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const source = resolve(import.meta.dir, "../src");
const layers = {
  core: new Set(["core"]),
  client: new Set(["core", "client"]),
  server: new Set(["core", "server"]),
} as const;

test("non-React layers import only their allowed source layers", async () => {
  for (const [layer, allowed] of Object.entries(layers)) {
    const root = resolve(source, layer);
    for await (const name of new Bun.Glob("**/*.{ts,tsx}").scan(root)) {
      const path = resolve(root, name);
      const contents = await readFile(path, "utf8");
      const imports = contents.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g);
      for (const [, specifier] of imports) {
        if (!specifier) continue;
        if (!specifier.startsWith(".")) {
          expect(specifier, `${name} must not import React or its UI dependencies`).not.toMatch(
            /^(?:react(?:-dom|-aria-components)?|@tanstack\/react-query|@floating-ui\/react|lucide-react)\b/,
          );
          continue;
        }
        const target = resolve(dirname(path), specifier);
        expect(target.startsWith(`${source}${sep}`), `${name} imports outside src`).toBe(true);
        const targetLayer = target.slice(source.length + 1).split(sep)[0];
        expect(allowed.has(targetLayer), `${name} imports ${specifier} from ${targetLayer}`).toBe(
          true,
        );
      }
      expect(contents, `${name} must not import CSS`).not.toMatch(/\bimport\s*["'][^"']+\.css["']/);
    }
  }
});

test("React implementation modules do not import the public entry", async () => {
  const root = resolve(source, "react");
  const entry = resolve(root, "index.ts");
  for await (const name of new Bun.Glob("**/*.{ts,tsx}").scan(root)) {
    const path = resolve(root, name);
    if (path === entry) continue;
    const contents = await readFile(path, "utf8");
    const imports = contents.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g);
    for (const [, specifier] of imports) {
      if (!specifier?.startsWith(".")) continue;
      expect(resolve(dirname(path), specifier), `${name} imports the public entry`).not.toBe(entry);
    }
  }
});
