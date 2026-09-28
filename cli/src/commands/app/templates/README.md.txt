# {{APP_TITLE}}

This starter shows up to 20 tables visible to the selected Altertable lakehouse profile. It is a local example, not a complete catalog inventory: the list is ordered by catalog, schema, and table name, then capped at 20.

## Run locally

Configure a profile with lakehouse access, then run from this directory:

```fish
altertable app dev
```

The CLI prints the local URL. Use `altertable app dev --port 3022` to choose a port. Run `altertable app check --lakehouse` to validate the app and execute its declared operation against the selected profile.
CLI runtime contributors can use `altertable app dev --watch-runtime` to upgrade the generated runtime and restart the preview when source templates change. The watcher stops if a generated runtime file was edited.

## Reading the view

“Tables shown” counts rows returned by this query. It is not the number of tables in the lakehouse. The catalog step counts only rows in that same limited result. “About the data” explains the exploration, scope, limitations, and glossary; SQL appears only when the server permits disclosure.

The app's query, data context, and presentation steps live in `src/`. The versioned `.altertable/runtime/` supplies the data transport and shared UI. The JSDoc beside the example and runtime exports explains each boundary where it is used.
