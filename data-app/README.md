# Data app development

`runtime/` is the private `@altertable/data-app` package. `starter/` is the actual getting-started application. `tests/` runs browser scenarios against the starter and its separate component fixtures.

The [runtime API map](runtime/README.md) routes readers to public entries and UI source. The [contributor router](AGENTS.md) identifies source and checks for each change.

The package separates React-free `core/`, `client/`, and `server/` source from `react/`, which owns hooks, the `DataApp` shell, and UI. Generated apps keep their question, SQL, validation, exploration context, and view in `src/`.

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
- `runtime/.oxlintrc.json` checks runtime React code; `starter/.oxlintrc.json` ships with each new app so `app check` enforces React Compiler, hooks, and accessibility correctness rules on app-owned source.
- Generated apps use package `#app/*` and `#config` imports. Oxlint's built-in `no-restricted-imports` rule rejects relative source imports without a custom plugin.
- `cli/src/commands/app/lib/distribution.ts` declares the starter copy allowlist. `src/`, app configuration, lockfile, and authoring docs ship. Browser fixtures, tests, dependencies, and build outputs do not.
- `createAppFiles` changes JSON identity fields and the lockfile root name. Application code reads `app.json`; source code has no template tokens.
- `cli/scripts/package-data-app.ts` supplies the Bun build plugin. It replaces the source payload loader with literal file data. The npm bundle embeds this payload; native releases compile that same bundle. Installed CLIs never read this repository to create an app.
- Generated apps commit `.altertable/runtime/` because it is a required `file:` dependency; only this repository's starter copy is ignored. Users own their generated `src/`, `app.json`, package manifest, and docs. The CLI owns `.altertable/runtime/` and records its source checksums. Public import paths remain `@altertable/data-app/...`.

The runtime owns its implementation dependencies. The starter owns React, ReactDOM, and its authoring tools. When runtime dependencies change, refresh the starter lockfile after setup:

```fish
cd data-app/starter
bun update @altertable/data-app --lockfile-only --ignore-scripts
```

Commit both project lockfiles when their respective dependencies change. Runtime code changes alone need no lockfile update. Keep exported API changes compatible with existing apps, or explain the required application migration explicitly.

## Upgrades

`app upgrade` validates installed checksums before replacing managed files, including removal of obsolete runtime files. It preserves app source. Dependency changes trigger a targeted Bun lockfile update without installing packages or running lifecycle scripts. Missing peers can be seeded from the starter's pinned dependencies; incompatible new peer requirements stop with an actionable error. A failed update restores runtime, package manifest, and lockfile. Dependency resolution can require the network or a populated Bun cache. Restart running previews after an upgrade.

The package is still private and bundled with the CLI. New generated apps use `@altertable/data-app` imports; the CLI upgrades the managed runtime files without changing app-owned source.

## Verify

```fish
bun run --cwd cli data-app:check
cd data-app/tests
bun install --frozen-lockfile
bunx playwright install chromium
bun run test
```

Source checks cover every runtime module and its contract, transport, search, formatting, and public component composition tests. Starter checks cover types, lint, formatting, and a production build. Browser tests cover connection states, retry, stale success, context, theme persistence, and Present navigation at desktop and phone sizes. The `/gallery` development route includes a section index and over 70 labeled cases across controls, typed filters, widget transitions, metrics, tables, charts, request boundaries, dates, overlays, Story and page chrome. Finite picker cycles and manual widget/request state controls expose initial loading, cached refresh, failure, retry and recovery. Geometry regressions verify stable feedback slots alongside keyboard focus, reduced motion, both themes and narrow layouts.

CLI tests cover distribution safety, creation, upgrades, dependency resolution, and rollback. Release smoke checks generate an app outside the checkout, install with a frozen lockfile, and run `app check` using the packaged CLI. The minimum CLI runtime compatibility job checks scaffolding only; building data apps uses the repository's current Bun toolchain.
