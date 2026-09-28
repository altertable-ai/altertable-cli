# Data app authoring router

The app owns its question, SQL, validation, exploration context, and view. Read the route for the task before editing. Use the runtime's public package exports; inspect its source for types and behavior.

## Choose a route

| Task | App-owned files | Read next |
| --- | --- | --- |
| Connect a source, define a query, or change inputs | `app.json`, `src/operations.ts`, optional `src/variables.ts` | [Data and operation authoring](docs/data.md) |
| Build a view, filters, request states, or Present steps | `src/App.tsx`, `src/styles.css` | [View authoring](docs/views.md) |
| Explain the exploration or define terms | `src/data-context.ts` | [Data guidance](docs/data.md), [context APIs](.altertable/runtime/README.md#find-ui-by-task) |
| Change title, scope, or brand | `app.json` | [Config and appearance APIs](.altertable/runtime/README.md#entry-points) |
| Find a component, hook, or parser | Read `.altertable/runtime/` | [Runtime API map](.altertable/runtime/README.md) |
| Replace the local server with hosting | `src/server.ts` | [Server authorization boundary](.altertable/runtime/src/server.ts) |

## Always preserve

- Confirm the app's organization and environment against the selected profile before querying. Resolve offline placeholders; if scopes differ, show both and connect the intended source.
- Build from observed data. Keep credentials and SQL execution on the server. Describe coverage honestly; distinguish missing data from a measured zero.
- Edit app-owned files. Runtime customizations belong upstream; `app upgrade` refuses locally modified runtime files.
- Commit `.altertable/runtime/`, `package.json`, and `bun.lock` together. The runtime is a vendored `file:` dependency needed by a fresh clone. Only the CLI repository's development starter ignores its generated runtime copy.

## Verify the changed surface

Run `altertable app check`. After changing operations or inputs, run `altertable app check --lakehouse` with the matching profile; it executes the fixed `app.json` fixtures. Inspect changed views at desktop and phone widths in both themes, including loading, empty, zero, and error states.

After updating the CLI, run `altertable app upgrade` and check again.
