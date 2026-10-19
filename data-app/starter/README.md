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

Use `@altertable/data-app` for contracts and clients, `@altertable/data-app-react` for authoring (`/ui` for components), and `@altertable/data-app-bun` for local serving (`/preview` for single-file previews).

Start with the [authoring router](AGENTS.md) for data and view changes, or the [package authoring guide](node_modules/@altertable/data-app/docs/app-authoring.md) to find components, hooks, and contracts.

## Check and upgrade

Run `altertable app lint` to check the app locally. Use `altertable app lint --lakehouse` to execute each operation's declared `checks` against the selected profile.

`altertable app upgrade` pins all declared data-app packages to the shared version tested with your CLI and updates the lockfile. It preserves app code and does not downgrade a newer installed package. Add only the packages the app uses, keep their versions aligned, and update imports to match their public exports before running `app lint`. Restart a running preview after upgrading.

## Version control

Commit app source, `package.json`, and `bun.lock`. A fresh clone installs the core, React authoring, and Bun data-app packages at their shared pinned version from npm with `bun install --frozen-lockfile`; installation needs registry access or a populated Bun cache. Keep custom code in `src/`.
