# {{APP_TITLE}}

This starter runs a lightweight SQL query to check the lakehouse connection. “Connected” appears only after that query succeeds; having a configured profile alone is not enough. The check does not establish access to specific datasets.

## Run locally

Configure a profile with lakehouse access, then run from this directory:

```fish
altertable app dev
```

The CLI prints the local URL. Use `altertable app dev --port 3022` to choose a port. Run `altertable app check --lakehouse` to validate the app and execute its declared operation against the selected profile.
CLI runtime contributors can use `altertable app dev --watch-runtime` to upgrade the generated runtime and restart the preview when source templates change. The watcher stops if a generated runtime file was edited.

## Build the first view

Choose a question, inspect the relevant data, and replace the `connection` operation in `src/operations.ts` with a bounded query that answers it. Render the result in `src/App.tsx`, add any reader-controlled inputs in `src/variables.ts`, and describe the exploration in `src/data-context.ts`. “About the data” shows the context, glossary, and disclosed queries; SQL appears only when the server permits disclosure.

The versioned `.altertable/runtime/` supplies the data transport and shared UI, including optional Present mode for an authored story. The JSDoc beside the example and runtime exports explains each boundary where it is used.
