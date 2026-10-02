# Data app development

`starter/` is the application copied by `altertable app create`. It pins the published
[`@altertable/data-app`](https://github.com/altertable-ai/data-app) package and ships a frozen
lockfile. Package source, API documentation, unit tests, and releases belong to that repository.
`tests/` exercises the starter and component fixtures against the installed npm package.

## Develop

From the repository root, using Fish:

```fish
bun install --cwd cli --frozen-lockfile
bun install --cwd data-app/starter --frozen-lockfile
./bin/altertable app dev --dir data-app/starter
```

Use a configured profile for live data. The starter executes a bounded connection query before
showing Connected. App queries, data context, views, and appearance remain app-owned.

## Ownership and distribution

The CLI embeds only the starter allowlist in `cli/src/commands/app/lib/distribution.ts`.
Both npm and native CLI builds can scaffold an app without reading this checkout or accessing
the network. Installing the generated app needs registry access or a populated Bun cache.
Generated projects commit their source, package manifest, and lockfile; they do not vendor runtime
source. Public imports use `@altertable/data-app/...`.

The starter owns React, ReactDOM, and its authoring tools. The package owns its implementation
dependencies. The browser entry calls `injectDataAppStyles()` before mounting. The app's `AGENTS.md`
points to the installed package guide and docs; dependency guides are not assumed to load automatically.

To adopt a package release, update its exact pin in both `starter/package.json` and
`tests/package.json`, regenerate both lockfiles, and run the checks below. Never resolve `latest`
during app creation. Develop package changes in the package repository; the CLI has no runtime
source watcher.

## Upgrades

`app upgrade` updates the app manifest and lockfile to the CLI's tested package version,
preserving unrelated dependencies and app code. A newer installed package is not downgraded.
Peer incompatibilities stop with an actionable error; missing peers are seeded from starter defaults.
Upgrades resolve only the lockfile and restore the original manifest and lockfile if resolution
fails. Restart running previews after an upgrade. Apps must already use the published package;
`app upgrade` does not migrate local runtime copies or rewrite app source.

## Verify

```fish
bun run --cwd cli data-app:check
bun install --cwd data-app/tests --frozen-lockfile
bun run --cwd cli data-app:test:browser
./scripts/verify.sh --quick
./scripts/verify.sh
```

Install Playwright Chromium with `bunx playwright install chromium` from `data-app/tests/`
if needed. Browser checks cover connection and request states, theme, context, and presentation
at phone and desktop widths. CLI tests cover offline scaffolding, npm consumption, package upgrades,
peer checks, and failed resolution. Release smoke checks create an app outside the checkout, install its
frozen lockfile, and run `app check` with the packaged CLI. The minimum Bun compatibility job
checks scaffolding only; app builds use the repository's current toolchain.
