# Data authoring

Confirm that the connected profile matches `app.json` scope. Inspect catalogs, tables, time coverage, and existing definitions through Altertable MCP or the CLI. Validate a bounded query before putting it in `src/operations.ts`. For broad requests, inspect distinct angles such as activity over time, feature reach, and organization usage before deciding what the app should show.

Replace the starter connection operation with app-specific operations. Define bounded parsers and policy with `defineOperation`, and include fixed valid `checks` for `altertable app check --lakehouse`. Use `defineDateRangeContract` when a query takes a calendar range; its parser, URL variable bounds, and displayed period share one policy.

Write the reader's context and glossary in `src/data-context.ts` with `defineDataContext`. If cards cite named SQL, register names with `defineQueryNames` and check references with `evidenceFor(dataContext, queryNames)`. Source-specific SQL and metric definitions belong in this app. The [runtime API map](../.altertable/runtime/README.md) links the exact types.
