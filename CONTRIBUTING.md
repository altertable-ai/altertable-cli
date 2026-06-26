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

## Tests

- Unit tests: `cd cli && bun test`
- Shell tests (offline): `./tests/configure_test.sh`, `./tests/management_test.sh`, `./tests/whoami_test.sh`, `./tests/catalogs_test.sh`, `./tests/scripting_test.sh`, `./tests/profile_test.sh`
- Integration tests (requires mock server): `./tests/integration_test.sh`

## Pull Requests

- Keep PRs focused on a single change
- Update `CHANGELOG.md` under `[Unreleased]` for user-facing changes
- Ensure CI passes before requesting review
