# Build this data app

Confirm `app.json` scope against the connected profile before querying. Inspect the source and execute bounded queries in that scope. For a broad question, explore more than one useful angle before choosing the view; a connection check does not establish coverage.

Write the question, SQL, and validation in `src/operations.ts`; put each operation's fixed live-check inputs in its `checks`. Explain the exploration and define terms in `src/data-context.ts`. Build conclusions from observed results, without presenting association as cause.

Use public imports from `@altertable/data-app-runtime`; its [API map](.altertable/runtime/README.md) and types define the view, request states, controls, and evidence. Keep credentials and SQL execution on the server. Edit app-owned files in `src/`; upgrade the managed runtime through the CLI.

Run `altertable app check --lakehouse` with the matching profile, then inspect the rendered app at phone and desktop widths, including loading, empty, error, and stale results.
