# Build this data app

Inspect the source and existing definitions before choosing queries. For broad questions, investigate several useful angles. Build conclusions from observed results; do not present association as cause. Keep copy concise and relevant to the reader.

| Task | App-owned files | Read next |
| --- | --- | --- |
| Connect a source, define a query, or change inputs | `app.json`, `src/operations.ts`, optional `src/variables.ts` | [Data and operation authoring](docs/data.md) |
| Build a view, filters, request states, or Present steps | `src/App.tsx`, `src/styles.css` | [View authoring](docs/views.md) |
| Explain the exploration or define terms | `src/data-context.ts` or `.tsx` | [Data guidance](docs/data.md), [context APIs](.altertable/runtime/README.md#find-ui-by-task) |
| Change title, scope, or brand | `app.json` | [Config and appearance APIs](.altertable/runtime/README.md#entry-points) |
| Find a component, hook, or parser | Read `.altertable/runtime/` | [Runtime API map](.altertable/runtime/README.md) |
| Replace the local server with hosting | `src/server.ts` | [Server authorization boundary](.altertable/runtime/src/server.ts) |

Edit app-owned files in `src/`; upgrade the managed runtime through the CLI. Use public runtime imports and read their types for API contracts.

Run `altertable app check --lakehouse` with the matching profile, then inspect the exploration at phone and desktop widths. Verify that its findings and interactions answer the user's question.
