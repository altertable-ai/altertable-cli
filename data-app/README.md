# Data app development

`runtime/` is the private `@altertable/data-app-runtime` package. `starter/` is the actual getting-started application. `tests/` runs browser scenarios against the starter and its separate component fixtures.

The runtime owns the standard `DataApp` page shell, `GettingStarted` connection screen, `useDataView` request state, browser and local server entry helpers, and reusable contract parsers. Generated apps keep their question, SQL, validation, exploration context, and view in `src/`.

## Develop

From the repository root, using Fish:

```fish
bun install --cwd cli --frozen-lockfile
bun run --cwd cli data-app:setup
bun install --cwd data-app/runtime --frozen-lockfile
bun install --cwd data-app/starter --frozen-lockfile
./bin/altertable app dev --dir data-app/starter --watch-runtime
```

Use a configured profile for live data. `--watch-runtime` watches canonical runtime source, validates the installed copy, upgrades it, and restarts the app. Edit runtime source in `runtime/src/`; the starter's `.altertable/runtime/` is generated and ignored. The starter's connection check executes a bounded query before showing Connected.

## Ownership and distribution

- `runtime/package.json` declares public exports and a `files` allowlist. Tests and development configuration live outside that list.
- `cli/src/commands/app/lib/distribution.ts` declares the starter copy allowlist. `src/`, app configuration, lockfile, and authoring docs ship. Browser fixtures, tests, dependencies, and build outputs do not.
- `createAppFiles` changes JSON identity fields and the lockfile root name. Application code reads `app.json`; source code has no template tokens.
- `cli/scripts/package-data-app.ts` supplies the Bun build plugin. It replaces the source payload loader with literal file data. The npm bundle embeds this payload; native releases compile that same bundle. Installed CLIs never read this repository to create an app.
- Users own their generated `src/`, `app.json`, package manifest, and docs. The CLI owns `.altertable/runtime/` and records its source checksums. Public import paths remain `@altertable/data-app-runtime/...`.

The runtime owns its implementation dependencies. The starter owns React, ReactDOM, and its authoring tools. When runtime dependencies change, refresh the starter lockfile after setup:

```fish
cd data-app/starter
bun update @altertable/data-app-runtime --lockfile-only --ignore-scripts
```

Commit both project lockfiles when their respective dependencies change. Runtime code changes alone need no lockfile update. Keep exported API changes compatible with existing apps, or explain the required application migration explicitly.

## Upgrades

`app upgrade` validates installed checksums before replacing managed files, including removal of obsolete runtime files. It preserves app source. Dependency changes trigger a targeted Bun lockfile update without installing packages or running lifecycle scripts. Missing peers can be seeded from the starter's pinned dependencies; incompatible new peer requirements stop with an actionable error. A failed update restores runtime, package manifest, and lockfile. Dependency resolution can require the network or a populated Bun cache. Restart running previews after an upgrade.

Existing generated apps keep their public imports. Their next `app upgrade` moves runtime implementation files into `src/` inside the managed package and removes the old tracked paths. App-owned files are preserved.

## Verify

```fish
bun run --cwd cli data-app:check
cd data-app/tests
bun install --frozen-lockfile
bunx playwright install chromium
bun run test
```

Source checks cover every runtime module and its contract, transport, search, formatting, and public component composition tests. Starter checks cover types, lint, formatting, and a production build. Browser tests cover connection states, retry, stale success, context, theme persistence, and Present navigation at desktop and phone sizes.

CLI tests cover distribution safety, creation, upgrades, dependency resolution, and rollback. Release smoke checks generate an app outside the checkout, install with a frozen lockfile, and run `app check` using the packaged CLI. The minimum CLI runtime compatibility job checks scaffolding only; building data apps uses the repository's current Bun toolchain.
