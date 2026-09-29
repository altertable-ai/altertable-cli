# Build this data app

Inspect source data, time coverage, and definitions. Choose useful questions, meaningful dimensions, and consequential findings; verify source semantics and describe associations without claiming causation. Verify the finished app against live data at phone and desktop widths.

| Task | App-owned files | Read next |
| --- | --- | --- |
| Connect a source, define a query, or change inputs | `app.json`, `src/operations.ts`, optional `src/variables.ts` | [Data and operation authoring](docs/data.md) |
| Build a view, filters, request states, or Present steps | `src/App.tsx`, `src/styles.css` | [View authoring](docs/views.md) |
| Explain the exploration or define terms | `src/data-context.tsx` | [Data guidance](docs/data.md), [context APIs](.altertable/runtime/README.md#find-ui-by-task) |
| Change title, scope, or brand | `app.json` | [Config and appearance APIs](.altertable/runtime/README.md#entry-points) |
| Find a component, hook, or parser | Read `.altertable/runtime/` | [Runtime API map](.altertable/runtime/README.md) |
| Replace the local server with hosting | `src/server.ts` | [Server authorization boundary](.altertable/runtime/src/server/index.ts) |

Edit app-owned source and use public runtime APIs. The generated connectivity screen is scaffolding, not an example analysis.

Run `altertable app check --lakehouse` with the matching profile, then inspect the exploration at phone and desktop widths. Verify that its findings and interactions answer the user's question.
