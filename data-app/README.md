# Data app integration

The starter comes from the exact published `@altertable/data-app-examples` version in
`cli/package.json`. Its source, guides, scripts, and tool configuration belong to the SDK.
This repository keeps only `starter/bun.lock`, the reviewed registry resolution used for offline
scaffolding and frozen installs. Do not edit generated files in `starter/`.

## Develop

From the repository root:

```fish
bun run setup
```

Setup generates the disposable `starter/` project from the same payload embedded in the CLI,
then installs its frozen dependencies. To regenerate it after changing the integration:

```fish
bun run --cwd cli data-app:prepare
```

With a matching configured profile, preview an app created outside this fixture:

```fish
./bin/altertable app create my-app
```

```fish
./bin/altertable app dev --dir my-app
```

The canonical standalone example uses fictional inline queries and creates no lakehouse objects.
Its installed authoring recipe describes distinct standalone, Finding, and semantic metric apps.
Change the upstream examples package to improve the starter.

## Distribution

`cli/src/commands/app/lib/distribution-source.ts` reads the published local example through
`getExampleDirectory()`, restores `.gitignore`, adds the frozen lockfile, and prepares identity
literals with the public manifest rewriter. `distribution.ts` inserts the requested name, title,
organization, and environment. No source override is maintained here.

Both npm and native builds embed these files with the internal `file-preview/` tooling. Creating
an app needs neither this checkout nor registry access. Installing it needs the registry or a
populated Bun cache. Generated apps depend on the runtime packages, not the examples package.
The manifest compiler runs in the installed preview tooling, outside the shipped CLI bundle;
directory and file scopes are extracted statically before receiving lakehouse access.

## Adopt an SDK release

Update the exact examples and manifest-tooling pins in `cli/package.json` and runtime pins in
`file-preview/package.json` and `tests/package.json`. Regenerate the fixture from that package:

```fish
bun install --cwd cli
```

```fish
bun run --cwd cli data-app:prepare
```

```fish
bun install --cwd data-app/starter --lockfile-only
```

Update the other lockfiles, then run setup and the verification below. Review and commit the
lockfiles; never resolve `latest` during app creation.

## Verify

```fish
bun run --cwd cli data-app:check
```

```fish
bun run --cwd cli data-app:test:browser
```

```fish
bun run check
```

The checks build and lint the generated fixture against the real published packages. Browser
tests exercise that fixture through the published Bun server and a mocked external lakehouse:
filters, evidence inspection, request states, themes, and registered-query boundaries on desktop
and phone. Component-level SDK tests belong to the SDK repository. npm and native smoke tests
exercise create, frozen install, lint/build, directory dev, and file preview outside the checkout.
