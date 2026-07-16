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

Commands should keep the execution path local and readable. The intended flow is:

```text
parse args -> build request -> send request -> decode result -> present output
```

Use these boundaries when adding or changing commands:

- `cli/src/commands/<family>/index.ts` owns the command group; each leaf command has a sibling `<name>.ts` file.
- `cli/src/commands/<family>/lib/**` owns implementation code used only by that command family.
- `cli/src/lib/**` is reserved for code shared by multiple command families.
- `cli/src/lib/args.ts` owns small reusable argument codecs. Prefer these helpers over ad hoc `String(...)` coercion.
- `cli/src/lib/http-request.ts` owns plane-aware HTTP transport. Do not build management/lakehouse URLs in commands.
- Request builders should return data structures. They should not perform transport as a side effect.
- Keep request descriptions declarative so a future dry-run mode can inspect them without performing I/O.
- Presentation should return `CommandOutputMode` or write through the command output sink. Avoid mixing transport, parsing, and terminal output in the same function.
- Declare the exported command immediately after imports, then place its helpers and types below it so reviewers see the public shape first.
- Define commands and argument schemas through `cli/src/lib/command.ts`; Citty is an implementation detail of that boundary.
- Derive related argument schemas from one shared definition instead of repeating flags and descriptions.
- Register top-level commands in `cli/src/commands/index.ts`.
- Colocate unit tests beside their subject as `<name>.test.ts`; reserve root `tests/` for black-box behavior.

If a path needs sharing, start at the narrowest common owner and move it to top-level `lib/` only when multiple command families use it.

## Tests

- Unit tests: `cd cli && bun test`
- Top-level black-box tests: `bun test "$PWD"/tests/*.test.ts`
- Integration tests (requires mock server): `bun test "$PWD"/tests/integration.e2e.ts`

## Pull Requests

- Keep PRs focused on a single change
- Update `CHANGELOG.md` under `[Unreleased]` for user-facing changes
- Ensure CI passes before requesting review
