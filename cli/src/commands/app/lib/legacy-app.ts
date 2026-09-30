import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { ConfigurationError } from "@/lib/errors.ts";

/** Only rewrite public import paths and documentation links; preserve app-owned logic. */
export async function legacyAppEdits(directory: string): Promise<Map<string, string>> {
  const edits = new Map<string, string>();
  const sources: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(join(directory, path), { withFileTypes: true })) {
      const name = join(path, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ConfigurationError(
          `Cannot migrate symlink ${name}. Update its package imports manually before upgrading.`,
        );
      }
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(name)) sources.push(name);
    }
  }
  await visit("src");
  for (const name of sources) {
    const source = await readFile(join(directory, name), "utf8");
    const removed = [
      "StorySection",
      "PlayStory",
      "StorySectionProps",
      "PlayStoryProps",
      "StoryStep",
    ];
    const reactImports = [
      ...source.matchAll(
        /(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']@altertable\/data-app\/react["']/g,
      ),
    ];
    if (
      reactImports.some((match) =>
        match[1]!.split(",").some((binding) =>
          removed.includes(
            binding
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+/)[0]!,
          ),
        ),
      ) ||
      /\bstory\s*=\s*\{\s*\{/.test(source) ||
      /\.storyStep\s*\(/.test(source)
    ) {
      throw new ConfigurationError(
        `Migrate story authoring in ${name} before upgrading: StorySection → DataWidget, PlayStory → PresentStory, context.storyStep → context.finding, and DataApp.story → a snapshot function with explicit evidence. See https://github.com/altertable-ai/data-app/blob/main/docs/react.md#migration-from-the-earlier-runtime. No app files were changed.`,
      );
    }
    const next = source.replace(
      /^(\s*)(import|export)\s+(type\s+)?\{([^}]+)\}\s+from\s+(["'])@altertable\/data-app\/server\5[ \t]*;?[ \t]*(\/\/[^\n]*|\/\*[^\n]*\*\/)?/gm,
      (
        statement,
        indent: string,
        keyword: string,
        type: string | undefined,
        bindings: string,
        quote: string,
        comment: string | undefined,
      ) => {
        if (type) return statement;
        const entries = bindings
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const local = entries.filter((value) =>
          /^(?:serveLocalApp|localLakehouse)(?:\s|$)/.test(value),
        );
        if (!local.length) return statement;
        const portable = entries.filter((value) => !local.includes(value));
        const statements = [
          `${keyword} { ${local.join(", ")} } from ${quote}@altertable/data-app/server/bun${quote};`,
        ];
        if (portable.length)
          statements.unshift(
            `${keyword} { ${portable.join(", ")} } from ${quote}@altertable/data-app/server${quote};`,
          );
        const note = comment && comment.trimStart();
        if (note && portable.length) return `${indent}${note}\n${statements.join("\n")}`;
        return indent + statements.join("\n") + (note ? ` ${note}` : "");
      },
    );
    if (
      /(?:import|export)\s+\*[^;]*["']@altertable\/data-app\/server["']|import\s*\(\s*["']@altertable\/data-app\/server["']/.test(
        next,
      )
    ) {
      throw new ConfigurationError(
        `Cannot safely migrate server imports in ${name}. Import serveLocalApp and localLakehouse from @altertable/data-app/server/bun, then retry.`,
      );
    }
    if (source !== next) edits.set(name, next);
  }
  const stylesheet = "@altertable/data-app/react/styles.css";
  const hasStyles = (
    await Promise.all(
      sources.map(async (name) =>
        (edits.get(name) ?? (await readFile(join(directory, name), "utf8"))).includes(stylesheet),
      ),
    )
  ).some(Boolean);
  if (!hasStyles) {
    const html = await readFile(join(directory, "src/index.html"), "utf8");
    const script = [...html.matchAll(/<script\b([^>]*)>/gi)].find((match) =>
      /\btype\s*=\s*["']module["']/i.test(match[1]!),
    );
    const reference = script?.[1]?.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const path = reference && relative(directory, resolve(directory, "src", reference));
    if (!path || !sources.includes(path) || !(await lstat(join(directory, path))).isFile()) {
      throw new ConfigurationError(
        `Cannot identify the browser entry. Import "${stylesheet}" in your browser entry, then retry app upgrade.`,
      );
    }
    edits.set(
      path,
      `import "${stylesheet}";\n${edits.get(path) ?? (await readFile(join(directory, path), "utf8"))}`,
    );
  }
  async function migrateDocs(path: string): Promise<void> {
    const absolute = join(directory, path);
    let stat;
    try {
      stat = await lstat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isDirectory()) {
      for (const name of await readdir(absolute)) await migrateDocs(join(path, name));
    } else if (stat.isFile() && path.endsWith(".md")) {
      const source = await readFile(absolute, "utf8");
      const prefix = relative(dirname(path), "node_modules/@altertable/data-app").replaceAll(
        "\\",
        "/",
      );
      let next = source
        .replace(
          /\]\((?:\.\.\/)*\.?\/?\.altertable\/runtime\/README\.md(?:#([^)]*))?\)/g,
          (_, anchor: string | undefined) => {
            const doc =
              anchor === "execute-named-queries"
                ? "contract.md"
                : anchor === "entry-points" || !anchor
                  ? "app-authoring.md"
                  : "react.md";
            return `](${prefix}/docs/${doc}${anchor && doc === "react.md" ? `#${anchor}` : ""})`;
          },
        )
        .replace(
          /\]\((?:\.\.\/)*\.?\/?\.altertable\/runtime\/src\/server\/index\.ts\)/g,
          `](${prefix}/docs/server.md)`,
        );
      next = next
        .replace("Read `.altertable/runtime/`", "Read the installed package docs")
        .replace(
          "CLI runtime contributors can use `altertable app dev --watch-runtime` to upgrade the generated runtime and restart the preview when runtime source changes. The watcher stops if a generated runtime file was edited.",
          "Runtime development belongs to the standalone Data App package repository.",
        )
        .replace(
          "Commit `.altertable/runtime/`, including its integrity record, together with `package.json` and `bun.lock`. It is a local package required by a fresh clone. Keep custom code in `src/` and use `altertable app upgrade` to replace the managed runtime.",
          "Commit app source, package.json, and bun.lock. Install the published package with bun install --frozen-lockfile. Keep custom code in src/ and use altertable app upgrade to update the tested package pin.",
        );
      if (path === "AGENTS.md" && !next.includes("node_modules/@altertable/data-app/AGENTS.md")) {
        next +=
          "\nRead `node_modules/@altertable/data-app/AGENTS.md` and its `docs/app-authoring.md` for public package usage. Do not edit installed package files.\n";
      }
      if (source !== next) edits.set(path, next);
    }
  }
  for (const path of ["AGENTS.md", "README.md", "docs"]) await migrateDocs(path);
  return edits;
}
