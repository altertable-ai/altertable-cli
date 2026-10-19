# Getting started

This starter runs a lightweight SQL query to check the lakehouse connection. “Connected” appears only after that query succeeds; having a configured profile alone is not enough. The check does not establish access to specific datasets.

The generated screen is a setup state. Its operation and data context contain no analytical example to copy. Discover the relevant data and build the exploration around the user's question; broad questions deserve more than one useful angle.

## Run locally

Configure a profile with lakehouse access, then run from this directory:

```fish
altertable app dev
```

The CLI prints the local URL. Use `altertable app dev --port 3022` to choose a port.

## Author the app

Start with the [authoring router](AGENTS.md) for data and view changes, or the [package authoring guide](node_modules/@altertable/data-app/docs/app-authoring.md) to find components, hooks, and contracts.

Import definitions, contracts, and clients from `@altertable/data-app` and its public subpaths. Use `@altertable/data-app-react` for React authoring, `@altertable/data-app-react/ui` for setup and custom UI components, and `@altertable/data-app-bun` for local serving. Keep all data-app package versions aligned when adding dependencies.

## Check and upgrade

Run `altertable app lint` to check the app locally. Use `altertable app lint --lakehouse` to execute each operation's declared `checks` against the selected profile.

`altertable app upgrade` updates declared data-app packages and the lockfile to the shared version tested with your CLI. It preserves app code and does not downgrade newer packages. Update your imports and app code if the package APIs change, then run `altertable app lint` again and restart any running preview.

## Version control

Commit app source, `package.json`, and `bun.lock`. On a fresh clone, run `bun install --frozen-lockfile` to restore the pinned dependencies; installation needs registry access or a populated Bun cache. Keep custom code in `src/`.
