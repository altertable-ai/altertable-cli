# Build this data app

Confirm `app.json` scope against the connected profile before querying. Inspect the source and execute bounded queries in that scope. For a broad question, explore more than one useful angle before choosing the view; a connection check does not establish coverage.

Write the question, SQL, and validation in `src/operations.ts`; put each operation's fixed live-check inputs in its `checks`. Explain the exploration and define terms in `src/data-context.ts` or `.tsx`. Build conclusions from observed results, without presenting association as cause.

| Task | App-owned files | Read next |
| --- | --- | --- |
| Connect a source, define a query, or change inputs | `app.json`, `src/operations.ts`, optional `src/variables.ts` | [Data and operation authoring](docs/data.md) |
| Build a view, filters, request states, or Present steps | `src/App.tsx`, `src/styles.css` | [View authoring](docs/views.md) |
| Explain the exploration or define terms | `src/data-context.ts` or `.tsx` | [Data guidance](docs/data.md), [context APIs](.altertable/runtime/README.md#find-ui-by-task) |
| Change title, scope, or brand | `app.json` | [Config and appearance APIs](.altertable/runtime/README.md#entry-points) |
| Find a component, hook, or parser | Read `.altertable/runtime/` | [Runtime API map](.altertable/runtime/README.md) |
| Replace the local server with hosting | `src/server.ts` | [Server authorization boundary](.altertable/runtime/src/server.ts) |

Use public imports from `@altertable/data-app-runtime`. Keep credentials and SQL execution on the server. Edit app-owned files in `src/`; upgrade the managed runtime through the CLI.

Run `altertable app check --lakehouse` with the matching profile, then inspect the rendered app at phone and desktop widths, including loading, empty, error, and stale results.
