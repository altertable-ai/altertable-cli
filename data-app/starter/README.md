# Getting started

This starter runs a lightweight SQL query to check the lakehouse connection. “Connected” appears only after that query succeeds; having a configured profile alone is not enough. The check does not establish access to specific datasets.

## Run locally

Configure a profile with lakehouse access, then run from this directory:

```fish
altertable app dev
```

The CLI prints the local URL. Use `altertable app dev --port 3022` to choose a port. Run `altertable app check --lakehouse` to validate the app and execute its declared operation against the selected profile.
CLI runtime contributors can use `altertable app dev --watch-runtime` to upgrade the generated runtime and restart the preview when runtime source changes. The watcher stops if a generated runtime file was edited.

## Build the first view

Choose a question, inspect the relevant data, and replace `connectionCheck()` in `src/operations.ts` with a bounded query that answers it. Replace `<GettingStarted />` in `src/App.tsx` with an authored view inside `<DataApp />`. Add `src/variables.ts` only when readers need filters, and describe the exploration in `src/data-context.ts`. Pass the result of `useDataView` to `<DataSection result={view}>`; the app decides what counts as empty. “About the data” shows the context, glossary, and disclosed queries; SQL appears only when the server permits disclosure.

The versioned `.altertable/runtime/` supplies transport and shared UI, including optional Present mode. Its `DataApp` page shell, connection starter, query hooks, local entry helpers, and contract parsers keep common setup out of `src/`. Start with the [runtime API map](.altertable/runtime/README.md) and the [authoring router](AGENTS.md) to find the relevant types and guides.

## Version control

Commit `.altertable/runtime/`, including its integrity record, together with `package.json` and `bun.lock`. It is a local package required by a fresh clone. Keep custom code in `src/` and use `altertable app upgrade` to replace the managed runtime.
