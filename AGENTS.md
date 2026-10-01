# Agent guide — altertable-cli

Executor-oriented router for agents working in this repository. User-facing docs live in [README.md](README.md).

## What this repo is

Altertable CLI — a TypeScript/Bun command-line tool for querying and managing the Altertable data platform. Source lives in `cli/`; black-box Bun tests in `tests/`; API specs in the `specs/` git submodule.

## Where to work

| Path                   | When to edit                                              |
| ---------------------- | --------------------------------------------------------- |
| `cli/src/`             | CLI commands, HTTP clients, formatting, config            |
| `cli/src/**/*.test.ts` | Colocated Bun unit tests for CLI logic                    |
| `data-app/starter/`    | Runnable getting-started app copied by `app create`       |
| `data-app/tests/`      | Browser tests and fixtures consuming the published package    |
| `tests/`               | Black-box end-user CLI tests run through `bin/altertable` |
| `specs/`               | Client API specs (submodule — read-only from this repo)   |
| `bin/altertable`       | Dev launcher — do not edit                                |

For data app starter, distribution, and browser work, follow [data-app/AGENTS.md](data-app/AGENTS.md).

## Start here

```bash
git submodule update --init --recursive   # first checkout only
./scripts/verify.sh --quick               # focused CLI changes, including coverage
./scripts/verify.sh                         # full gate before PR (mirrors CI minus native compile)
./scripts/verify.sh --integration         # lakehouse HTTP paths (mock at :15000)
```

For data app changes, run the focused checks first from the repository root:

```fish
bun run --cwd data-app/starter build
bun run --cwd cli data-app:test:browser
```

The starter build requires its published package dependencies; see [data-app/README.md](data-app/README.md)
for setup and browser prerequisites. Run `bun run --cwd cli data-app:check` to check all
three data app projects together. Use `./scripts/verify.sh --quick` after focused checks,
then default `./scripts/verify.sh` before opening a PR.

## Deep guides

- [cli/AGENTS.md](cli/AGENTS.md) — CLI implementation, architecture cookbook, verification details
- [data-app/README.md](data-app/README.md) — data app source, distribution, setup, upgrades, and tests
- [specs/AGENTS.md](specs/AGENTS.md) — spec submodule contribution rules (different concern)
- [DEVELOPMENT.md](DEVELOPMENT.md) — build, compile, release, spec conformance
- [CONTRIBUTING.md](CONTRIBUTING.md) — PR workflow
- [plans/README.md](plans/README.md) — implementation plan index

## Do not edit

- `bin/altertable` — thin launcher (`exec bun run cli/src/cli.ts`)
- `cli/src/generated/**` — run `cd cli && bun run generate` after OpenAPI changes
- `cli/dist/**` — build output
- Secrets, credentials, or `.env` files

## Submodule

Initialize before first verify or spec work:

```bash
git submodule update --init --recursive
```

## Plans

When completing an advisor plan from `plans/`, update its status row in [plans/README.md](plans/README.md) to DONE.
