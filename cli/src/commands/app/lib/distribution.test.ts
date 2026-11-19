import { expect, test } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

import { getExampleDirectory } from '@altertable/data-app-examples';
import { extractDataAppManifest } from '@altertable/data-app-manifest';

import { readDataAppPayload } from '@/commands/app/lib/distribution-source.ts';
import { createAppFiles } from '@/commands/app/lib/distribution.ts';
import { recommendedDataAppVersion } from '@/commands/app/lib/package.ts';

test('distribution embeds a deterministic starter with an exact package pin and no runtime', async () => {
  const payload = await readDataAppPayload();
  expect(await readDataAppPayload()).toEqual(payload);
  expect(Object.keys(payload)).toEqual(['starter', 'filePreview']);
  expect(Object.keys(payload.starter)).toContain('src/App.tsx');
  const previewPackage = JSON.parse(payload.filePreview['package.json']!);
  const starterPackage = JSON.parse(payload.starter['package.json']!);
  expect(previewPackage.dependencies).toEqual({
    ...starterPackage.dependencies,
    '@altertable/data-app-manifest': recommendedDataAppVersion(),
  });
  expect(payload.filePreview['bun.lock']).toContain('typescript');
  expect(payload.filePreview['extract-manifest.js']).toContain(
    'extractDataAppManifest'
  );

  for (const path of Object.keys(payload.starter)) {
    expect(path).not.toMatch(
      /(^|\/)(tests|fixtures|node_modules|dist|\.altertable)(\/|$)|\.txt$/
    );
  }
  const identity = {
    name: 'example',
    title: `A 'quoted' title $& __APP_ORGANIZATION__ \\n`,
    scope: {
      organization: '<script>& {{APP_TITLE}}',
      environment: 'test\nteam\u2028end',
    },
  };
  const files = createAppFiles(payload, identity);
  expect(extractDataAppManifest(files['app.ts']!).manifest).toMatchObject({
    title: identity.title,
    scope: identity.scope,
  });
  expect(
    JSON.parse(files['package.json']!).dependencies['@altertable/data-app']
  ).toBe(recommendedDataAppVersion());
  expect(JSON.parse(files['package.json']!).dependencies).toMatchObject({
    '@altertable/data-app': '0.78.0',
    '@altertable/data-app-react': '0.78.0',
    '@altertable/data-app-bun': '0.78.0',
  });
  expect(files['src/main.tsx']).toContain("from '@altertable/data-app-react'");
  expect(files['src/App.tsx']).toBe(payload.starter['src/App.tsx']);
  expect(files['src/server.ts']).toContain('@altertable/data-app-bun');
  expect(files['src/main.tsx']).toContain('installLocalQueryLakehouse();');
  expect(files['bun.lock']).toContain('"name": "example"');
});

test('app-owned authoring links resolve within the generated files', async () => {
  const files = createAppFiles(await readDataAppPayload(), {
    name: 'docs-test',
    title: 'Docs',
    scope: { organization: 'Test', environment: 'test' },
  });
  expect(files['AGENTS.md']).toContain(
    'https://github.com/altertable-ai/data-app/blob/v0.78.0/docs/app-authoring.md'
  );
  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith('.md')) continue;
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]!.split('#')[0]!;
      if (!target || /^[a-z]+:\/\//i.test(target)) continue;
      const path = posix.normalize(posix.join(posix.dirname(name), target));
      // Package documentation is validated after installation in the app creation test.
      if (path.startsWith('node_modules/@altertable/data-app/')) continue;
      expect(files[path], `${name} links to missing ${path}`).toBeDefined();
    }
  }
});

test('the embedded starter preserves the published example, including its tools and guides', async () => {
  const example = getExampleDirectory('starter-local-data-app');
  const payload = await readDataAppPayload();
  const identity = {
    name: 'canonical-example',
    title: 'Canonical example',
    scope: { organization: 'Acme', environment: 'production' },
  };
  const files = createAppFiles(payload, identity);
  async function compare(path: string, prefix = ''): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory())
        await compare(join(path, entry.name), name + '/');
      else if (name === 'app.ts') {
        const original = extractDataAppManifest(
          await readFile(join(path, entry.name), 'utf8')
        ).manifest!;
        const prepared = extractDataAppManifest(files[name]!).manifest!;
        expect(prepared).toEqual({
          ...original,
          title: identity.title,
          scope: identity.scope,
        });
      } else {
        expect(
          payload.starter[name === '_gitignore' ? '.gitignore' : name]
        ).toBe(await readFile(join(path, entry.name), 'utf8'));
      }
    }
  }
  await compare(example);
});
