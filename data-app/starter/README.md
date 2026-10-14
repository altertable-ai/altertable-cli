# Getting started

This starter runs a lightweight SQL query to check the lakehouse connection. “Connected” appears only after that query succeeds; having a configured profile alone is not enough. The check does not establish access to specific datasets.

The generated screen is a setup state. Its operation and data context contain no analytical example to copy. Discover the relevant data and build the exploration around the user's question; broad questions deserve more than one useful angle.

## Run locally

Configure a profile with lakehouse access, then run from this directory:

```fish
altertable app dev
```

The CLI prints the local URL. Use `altertable app dev --port 3022` to choose a port.

For a hosted single-file app, use `altertable app dev --file ./index.tsx` from any directory.
This previews the file in the package's hosted sandbox with automatic reloads. The file must
import `defineDataApp` from `@altertable/data-app` and declare a literal scope matching the
selected profile. The CLI installs its tested runtime in a cache and keeps profile credentials
in the loopback proxy. `--file` and `--dir` are mutually exclusive.

## Author the app

Start with the [authoring router](AGENTS.md) for data and view changes, or the [package authoring guide](node_modules/@altertable/data-app/docs/app-authoring.md) to find components, hooks, and contracts.

## Check and upgrade

Run `altertable app lint` to check the app locally. Use `altertable app lint --lakehouse` to execute each operation's declared `checks` against the selected profile.

`altertable app upgrade` pins the package version tested with your CLI and updates the lockfile. It preserves app code and does not downgrade a newer installed package. Restart a running preview after upgrading.

When upgrading from 0.68.0 or earlier to 0.69.0, remove operation `output` parsers.
Validate query rows inside `run` and return the validated result; clients infer its type from
`run`. Run `altertable app lint` after migrating your operations.

## Version control

Commit app source, `package.json`, and `bun.lock`. A fresh clone installs `@altertable/data-app` from npm with `bun install --frozen-lockfile`; installation needs registry access or a populated Bun cache. Keep custom code in `src/`.
