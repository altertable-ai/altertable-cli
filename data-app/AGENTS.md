# Data app contributor router

| Change | Source and guidance | Focused check |
| --- | --- | --- |
| Runtime contract, transport, or formatting | `runtime/src/`; [API map](runtime/README.md#entry-points) | Runtime typecheck and `runtime/tests/` |
| UI component or behavior | [UI map](runtime/README.md#find-ui-by-task); styles beside components | Runtime checks; relevant browser scenarios in `tests/` |
| Generated app defaults or author guidance | `starter/`; [app authoring router](starter/AGENTS.md) | Starter checks and CLI app creation tests |
| Copied files or runtime upgrades | `../cli/src/commands/app/lib/distribution.ts`, `../cli/src/commands/app/upgrade.ts` | Distribution and upgrade tests; packaged-app smoke |

See [development commands](README.md#develop). Run `bun run --cwd cli data-app:check` from the repository root for source checks. Run browser scenarios from `data-app/tests/` with `bun run test`.

Preserve package export paths when moving implementations. `runtime/src/ui/index.ts` is the public UI inventory; import component implementations directly inside the runtime. Keep component styles beside their source. Source-specific SQL and metric definitions belong in apps.

JSDoc should explain constraints, ownership, units, security boundaries, or surprising behavior. Let names and types describe obvious props and functions. Put task routing in the API map and app guides.

Canonical `runtime/` is tracked. The repository starter's `.altertable/runtime/` is ignored and recreated by setup; generated user apps commit their vendored runtime. Runtime `package.json` lists distributed files, while the CLI distribution manifest lists starter files. Keep routing links valid in the generated artifact.
