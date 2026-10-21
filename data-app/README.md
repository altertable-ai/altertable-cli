# Data app development

`starter/` is the application copied by `altertable app create`. It pins the published
[core, React authoring, and Bun packages](https://github.com/altertable-ai/data-app)
to a shared version and ships a frozen lockfile. Package source, API documentation, unit tests,
and releases belong to that repository.
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

The CLI embeds the starter and internal file-preview project allowlists in
`cli/src/commands/app/lib/distribution.ts`.
Both npm and native CLI builds can scaffold an app without reading this checkout or accessing
the network. Installing the generated app needs registry access or a populated Bun cache.
Generated projects commit their source, package manifest, and lockfile; they do not vendor runtime
source.

Each consumer declares only the packages it uses:

| Package                      | Consumers                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `@altertable/data-app`       | Starter definitions, contracts, and clients; browser-test server |
| `@altertable/data-app-react` | Starter UI and browser-test fixtures                             |
| `@altertable/data-app-bun`   | Starter local server and single-file preview                     |

Browser-test fixtures live under `starter/` and resolve React authoring from the starter's
own dependencies. Keep the browser-test server's manifest limited to its direct dependencies.

The starter owns React, ReactDOM, and its authoring tools. The package owns its implementation
dependencies. The browser entry calls `injectDataAppStyles()` before mounting. The app's `AGENTS.md`
points to the installed package guide and docs; dependency guides are not assumed to load automatically.

To adopt a package release, update the exact pins for packages used in `starter/package.json`,
`tests/package.json`, and `file-preview/package.json`, regenerate their lockfiles, and run the checks
below. Never resolve `latest` during app creation. Develop package changes in the package
repository; the CLI has no runtime source watcher.

## Upgrades

`app upgrade` updates declared data-app dependencies and dev dependencies in the app manifest
and lockfile to the CLI's tested shared version. It preserves dependency placement, unrelated
dependencies, and app code, and does not downgrade newer installations. Peer incompatibilities
stop with an actionable error; missing required peers use starter defaults.

Upgrades resolve only the lockfile and restore the original manifest and lockfile if resolution
fails. Apps must use published packages. The command does not add data-app packages or rewrite
app imports; authors update their source as needed, run `app lint`, and restart running previews.

## Verify

```fish
bun run setup
bun run --cwd cli data-app:check
bun run --cwd cli data-app:test:browser
bun run check --quick
bun run check
```

Install Playwright Chromium with `bunx playwright install chromium` from `data-app/tests/`
if needed. Browser checks cover connection and request states, theme, context, and presentation
at phone and desktop widths. CLI tests cover offline scaffolding, npm consumption, package upgrades,
peer checks, and failed resolution. Release smoke checks create an app outside the checkout, install its
frozen lockfile, and run `app lint` with the packaged CLI. The minimum Bun compatibility job
checks scaffolding only; app builds use the repository's current toolchain.
