# Contributing to altertable-cli

## Development Setup

The CLI is a TypeScript/Bun project in `cli/`. The entrypoint `bin/altertable` is a thin launcher — do not edit it unless the launcher path changes.

1. Fork and clone the repository
2. Initialize submodules: `git submodule update --init --recursive`
3. Install dependencies: `cd cli && bun install`
4. Install the [Oxc VS Code extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) (works in Cursor) for format-on-save and lint diagnostics

See [DEVELOPMENT.md](DEVELOPMENT.md) for build, compile, and release details.

## Making Changes

1. Create a branch from `main`
2. Edit `cli/src/**`
3. Run checks: `./scripts/verify.sh` (use `--quick` for iterative CLI-only work; full verify before opening PR)
4. Run integration tests when touching lakehouse HTTP paths: `./scripts/verify.sh --integration` (mock at `:15000`)
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)
6. Update `CHANGELOG.md` under `[Unreleased]` when the change is user-facing
7. Open a pull request

## Code Style

Match existing conventions in `cli/src/`:

- Function declarations over const function expressions (except one-liners)
- Types over interfaces
- Explicit variable names
- Minimal scope — focused diffs only

## Command Architecture

Commands should keep platform concepts split and composed. The intended flow is:

```text
parse args -> build operation plan -> run effects -> decode result -> present output
```

Use these boundaries when adding or changing commands:

- `cli/src/commands/**` owns command shape, argument parsing, operation ids, capability metadata, and presentation choice.
- `cli/src/lib/operation-codec.ts` owns small reusable argument codecs. Prefer these helpers over ad hoc `String(...)` coercion.
- `cli/src/lib/operation-effect.ts` owns executable operation plans and the effect handler registry.
- `cli/src/lib/http-operation.ts` owns named HTTP operation descriptors. Prefer descriptors over command-local request objects.
- `cli/src/lib/operation-transport.ts` owns plane-aware HTTP transport. Do not build management/lakehouse URLs in commands.
- Request builders should return data structures. They should not perform transport as a side effect.
- Presentation should return `CommandOutputMode` or write through the command output sink. Avoid mixing transport, parsing, and terminal output in the same function.
- Register every command surface with a stable operation id, capabilities, effects, planes, mutability, and output shape through `defineOperationCommand`.

Avoid adding compatibility wrappers that both build and execute requests. If a shared path is needed, share the request builder, effect builder, parser, or presenter instead.

## Tests

- Unit tests: `cd cli && bun test`
- Top-level black-box tests: `bash -c 'mapfile -t tests < <(find "$PWD/tests" -maxdepth 1 -name "*.test.ts" | sort); bun test "${tests[@]}"'`
- Integration tests (requires mock server): `bun test tests/integration.e2e.ts`

## Pull Requests

- Keep PRs focused on a single change
- Update `CHANGELOG.md` under `[Unreleased]` for user-facing changes
- Ensure CI passes before requesting review
