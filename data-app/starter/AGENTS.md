# Build this data app

Inspect source data, time coverage and existing definitions before choosing an exploration. For broad questions, investigate complementary angles. Build conclusions from observed results; do not present association as cause. Keep copy concise and relevant to the reader.

Read `node_modules/@altertable/data-app/AGENTS.md` and its [app authoring guide](node_modules/@altertable/data-app/docs/app-authoring.md) before changing the app. Run `bun install --frozen-lockfile` if the package is not installed.

| Task | App-owned files | Read next |
| --- | --- | --- |
| Connect a source, define a query, or change inputs | `app.json`, `src/operations.ts`, optional `src/variables.ts` | [Data and operation authoring](docs/data.md) |
| Build a view, filters, request states, or Present steps | `src/App.tsx`, `src/styles.css` | [View authoring](docs/views.md) |
| Explain the exploration or define terms | `src/data-context.ts` or `.tsx` | [Data guidance](docs/data.md), [context APIs](node_modules/@altertable/data-app/docs/react.md#find-ui-by-task) |
| Change title, scope, or brand | `app.json` | [Config and appearance APIs](node_modules/@altertable/data-app/docs/app-authoring.md) |
| Find a component, hook, or parser | Read the installed package docs | [Package authoring guide](node_modules/@altertable/data-app/docs/app-authoring.md) |
| Replace the local server with hosting | `src/server.ts` | [Server authorization boundary](node_modules/@altertable/data-app/docs/server.md) |

Edit app-owned source and use public package APIs. Do not edit installed package files. The generated connectivity screen is scaffolding, not an example analysis.

Run `altertable app lint --lakehouse` with the matching profile, then inspect the exploration at phone and desktop widths. Verify that its findings and interactions answer the user's question.
