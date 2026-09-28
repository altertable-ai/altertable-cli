# Data app authoring router

The app owns its question, SQL, validation, exploration context, and view. Read the route for the task before editing. Use the runtime's public package exports; inspect its source for types and behavior.

## Choose a route

| Task | App-owned files | Read next |
| --- | --- | --- |
| Connect a source, define a query, or change inputs | `app.json`, `src/operations.ts`, optional `src/variables.ts` | [Data and operation authoring](docs/data.md) |
| Build a view, filters, request states, or Present steps | `src/App.tsx`, `src/styles.css` | [View authoring](docs/views.md) |
| Explain the exploration or define terms | `src/data-context.ts` or `.tsx` | [Data guidance](docs/data.md), [context APIs](.altertable/runtime/README.md#find-ui-by-task) |
| Change title, scope, or brand | `app.json` | [Config and appearance APIs](.altertable/runtime/README.md#entry-points) |
| Find a component, hook, or parser | Read `.altertable/runtime/` | [Runtime API map](.altertable/runtime/README.md) |
| Replace the local server with hosting | `src/server.ts` | [Server authorization boundary](.altertable/runtime/src/server.ts) |

## Shared boundaries

Build from observed data and keep credentials and SQL execution on the server. Edit app-owned files; runtime customizations belong upstream. See [version control](README.md#version-control) for managed runtime ownership.

Run the [local checks](README.md#check-and-upgrade) after changes. The data and view guides specify the additional checks for their surfaces.
