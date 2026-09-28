# Getting started

This starter runs a lightweight SQL query to check the lakehouse connection. “Connected” appears only after that query succeeds; having a configured profile alone is not enough. The check does not establish access to specific datasets.

## Run locally

Configure a profile with lakehouse access, then run from this directory:

```fish
altertable app dev
```

The CLI prints the local URL. Use `altertable app dev --port 3022` to choose a port.
CLI runtime contributors can use `altertable app dev --watch-runtime` to upgrade the generated runtime and restart the preview when runtime source changes. The watcher stops if a generated runtime file was edited.

## Author the app

Start with the [authoring router](AGENTS.md) for data and view changes, or the [runtime API map](.altertable/runtime/README.md) to find components, hooks, and contracts.

## Check and upgrade

Run `altertable app check` to check the app locally. Use `altertable app check --lakehouse` to also execute its declared operations against the selected profile.

After updating the CLI, run `altertable app upgrade` and check again.

## Version control

Commit `.altertable/runtime/`, including its integrity record, together with `package.json` and `bun.lock`. It is a local package required by a fresh clone. Keep custom code in `src/` and use `altertable app upgrade` to replace the managed runtime.
