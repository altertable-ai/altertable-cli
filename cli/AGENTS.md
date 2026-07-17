# Agent guide — `cli/`

Repo-level router: [../AGENTS.md](../AGENTS.md). Run `./scripts/verify.sh` from repo root.

Executor-oriented notes for working in the TypeScript CLI subtree.

## Scope

- Source: `cli/src/`; entry point: `src/cli.ts`
- Runtime: [Bun](https://bun.sh); version pinned in [../.bun-version](../.bun-version)
- Full user docs: [README](../README.md)

## Verification commands

Preferred — from repo root:

```bash
./scripts/verify.sh --quick    # CLI checks only (typecheck, lint, format, knip, coverage, openapi drift)
./scripts/verify.sh            # full gate (mirrors CI minus native compile)
./scripts/verify.sh --integration   # + tests/integration.e2e.ts (mock at :15000)
```

Manual equivalents from `cli/`:

```bash
bun run typecheck
bun run lint
bun run format:check
bun test
bun run test:coverage
bun run knip
```

Top-level black-box tests from repo root:

```bash
bun test "$PWD"/tests/*.test.ts
bun test "$PWD"/tests/integration.e2e.ts
```

## Architecture

- **Dual-plane auth**: lakehouse data plane (HTTP Basic) vs management REST (Bearer API key). See root README credential tables.
- **`CliRuntime` + `OutputSink`** (`src/lib/runtime.ts`): `defineCommand` injects `runtime`, `sink`, and a lazy `execution` context into every command handler. Commands pass `sink` to output helpers rather than writing to the console.
- **Direct execution**: a leaf command parses its arguments, builds a plain request value, sends it, and presents the result. Request values stay declarative as the seam for a future dry-run mode; there is no operation/effect framework.
- **`writeCommandOutput`** (`src/lib/command-output.ts`): unified success output — raw API, normalized envelopes, tabular management, deletes. Commands pass their injected `sink` explicitly.
- **When to use `sink` directly**: bespoke output (custom tables, metadata messages) — `sink.writeJson`, `sink.writeHuman`, `sink.writeMetadata`.
- **When to use helpers**: API-shaped responses with `--json` parity — pass `sink` as the last argument.
- Lakehouse streaming lives in `lakehouse/`; query presentation lives in `query-output.ts` and `query-format.ts`.

## Conventions

- Declare and export each command immediately after its imports; keep supporting helpers and types below it.
- Import command types and `defineArgs` from `src/lib/command.ts`; only that boundary should depend on Citty's types.
- Derive related argument schemas from shared fragments instead of repeating flag definitions.
- Function declarations over const function expressions (except one-liners)
- Types over interfaces
- Explicit variable names; match surrounding file style
- Minimal scope — focused diffs only

## Error contract

- Stable exit codes in `src/lib/errors.ts` — do not renumber
- `--json` errors go to stderr; success JSON to stdout
- Use `CliError` / `ConfigurationError` for user-facing validation

## Secrets and config in tests

- Never commit credentials
- Tests use `ALTERTABLE_SECRET_BACKEND=file` and temp dirs via `ALTERTABLE_CONFIG_HOME`
- Prefer `--password-stdin` / `--api-key-stdin` in docs and examples

## Specs

- API specs live in the `specs/` submodule (see [DEVELOPMENT.md](../DEVELOPMENT.md))
- Lakehouse spec conformance table: [CLI spec conformance (lakehouse)](../DEVELOPMENT.md#cli-spec-conformance-lakehouse)

## File map

| Path                                  | Responsibility                                             |
| ------------------------------------- | ---------------------------------------------------------- |
| `src/cli.ts`                          | Citty root command, global flags, error bootstrap          |
| `src/context.ts`                      | Parsed global flags (`json`, `debug`, `profile`, timeouts) |
| `src/commands/<family>/index.ts`      | One top-level command group                                |
| `src/commands/<family>/<name>.ts`     | One leaf command                                           |
| `src/commands/<family>/lib/*`         | Implementation private to that command family              |
| `src/lib/*`                           | Code shared by multiple command families                   |
| `src/test-utils/*`                    | Shared CLI test harnesses and temporary workspaces         |
| `src/generated/openapi-types.ts`      | Generated — run `bun run generate` after OpenAPI changes   |
| `src/generated/openapi-operations.ts` | Generated operation index for `api routes`                 |
| `src/**/*.test.ts`                    | Unit tests colocated beside their subject                  |
| `../tests/*.test.ts`                  | Black-box end-user CLI tests at repo root                  |
| `../tests/integration.e2e.ts`         | Mock-server lakehouse integration test                     |

**Largest/hot files** — read before large refactors: `lib/http.ts`, `lib/profile-configure-core.ts`, `lib/query-format.ts`, `commands/api/lib/http.ts`.

| Module                                  | Role                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `commands/query/`, `append/`, `upload/` | Data-plane commands                                                 |
| `commands/api/`                         | Management HTTP invoker (`api /path`), spec, routes                 |
| `commands/api/lib/http.ts`              | HTTP invoker logic for `api`                                        |
| `commands/api/lib/body.ts`              | `--input`, `-f key=value`, and `-F key=value` body builders         |
| `lib/profile-configure-core.ts`         | Credential store (`configureRunSet`, show, clear)                   |
| `lib/profile-configure.ts`              | Profile configuration flags and interactive wizard (`--scope`)      |
| `lib/profile-configure-interactive.ts`  | Wizard prompts + credential collection                              |
| `lib/profile-status.ts`                 | Post-configure credential verification (`configureVerify`)          |
| `lib/profile/model.ts`                  | Profile store/inspect + credential presence shared by auth commands |
| `commands/profile/`                     | Profile subcommands, `profile configure`, `profile show`            |
| `lib/query-output.ts`                   | Shared query output formats and sink dispatch                       |
| `lib/http.ts`                           | Shared HTTP transport, logging, mock file support                   |
| `lib/management/`                       | Shared management identity, catalogs, and presentation              |
| `commands/catalogs/lib/requests.ts`     | Declarative catalog create request builder                          |
| `ui/prompts.ts`                         | Shared interactive prompt adapter and types                         |
| `lib/errors.ts`                         | Exit codes, `CliError`, JSON error envelope                         |
| `commands/completion/lib/spec.ts`       | Walks Citty tree for shell completion                               |

## Command tree

Source of truth: `src/commands/index.ts`. Verify with `bin/altertable --help`.

```
altertable
├── profile (--configure [--scope management|lakehouse], show, list, use, …), catalogs
├── query (run, show, cancel)
├── append (run, task), upload
├── api
│   ├── spec
│   ├── routes
│   └── GET | POST | PATCH | DELETE | PUT  (HTTP invoker also supports `api /whoami`, `api -X GET /path`)
└── completion
    ├── install [bash|fish|zsh]
    ├── generate [bash|fish|zsh]
    └── bash|fish|zsh  (raw script compatibility aliases)
```

`query` exposes `run` as its Citty default leaf and takes the SQL statement as a bare positional. Prefer the public form `altertable query "…"` in docs, tests, and new call sites unless a test is explicitly covering the command tree shape. A bare statement is routed to `run` by `normalizeQueryInvocatorRawArgs` in `bootstrap`, mirroring the `api` command's rawArgs rewrite.

## Cookbook

### Recipe A — New top-level product command

1. Create `src/commands/myfeature/index.ts` exporting `myfeatureCommand` via `defineCommand`.
2. Put each subcommand in `src/commands/myfeature/<name>.ts`.
3. Put private helpers and request builders in `src/commands/myfeature/lib/`.
4. Register the top-level command in `src/commands/index.ts`.
5. Add `<name>.test.ts` beside the command or library under test; add a root `tests/` case only for black-box behavior.
6. Flags on command `args` are picked up by completion automatically; run completion tests after structural changes.

Minimal pattern (management HTTP command):

```typescript
import { defineCommand } from "@/lib/command.ts";
import { sendHttp } from "@/lib/http-request.ts";

export const myfeatureCommand = defineCommand({
  meta: { name: "myfeature", description: "…" },
  async run({ execution, sink }) {
    const request = { plane: "management", method: "GET", endpoint: "/path" } as const;
    const response = await sendHttp(request, execution);
    sink.writeJson(JSON.parse(response));
  },
});
```

### Recipe B — New management REST operation

New API operations ship in `cli/openapi/openapi.yaml` (copied from the server). Run `bun run generate` to refresh types and `OPENAPI_OPERATIONS`. Integrators call them via HTTP — no new Citty subcommands:

```bash
altertable api routes                    # discover method + path
altertable api /whoami                   # default GET
altertable api -X GET /path -f q=value   # forced GET puts fields in the query string
altertable api /new_resource -f …        # invoke (POST inferred)
```

Bump the OpenAPI spec and extend `openapi-http-conformance.test.ts` placeholder mapping if new path parameters appear.

### Recipe C — Change exit codes or JSON errors

1. Edit `src/lib/errors.ts` only
2. Update `cli/src/lib/errors.test.ts` and `tests/scripting.test.ts`
3. Update README scripting table — do not renumber existing codes

## Testing guide

| Change type          | Run                                              |
| -------------------- | ------------------------------------------------ |
| lib pure function    | `cd cli && bun test path/to.test.ts`             |
| command validation   | colocated `src/commands/<family>/<name>.test.ts` |
| HTTP behavior        | mock file via `ALTERTABLE_MOCK_HTTP_FILE`        |
| end-to-end lakehouse | `./scripts/verify.sh --integration`              |
| completion structure | `cd cli && bun test src/commands/completion`     |

Test env vars: `ALTERTABLE_CONFIG_HOME`, `ALTERTABLE_SECRET_BACKEND=file`, `ALTERTABLE_MOCK_HTTP_FILE`, `ALTERTABLE_HTTP_LOG`.

Lakehouse endpoint coverage: [DEVELOPMENT.md spec conformance table](../DEVELOPMENT.md#cli-spec-conformance-lakehouse).

Example mock HTTP test pattern: command tests use `src/test-utils/lakehouse.ts` with `ALTERTABLE_MOCK_HTTP_FILE`. Root black-box tests use `tests/helpers.ts`.

## Invariants (do not break)

- Exit codes 0–10 stable (`errors.ts`)
- `--json`: success stdout, error stderr JSON envelope
- Dual-plane configure: one authentication mechanism per flag-based invocation; the interactive wizard may configure both planes in one session
- HTTP log redaction in tests (`setupHttpLog` / `readHttpLog` in `tests/helpers.ts`)
- `bin/altertable` launcher unchanged
- No raw `console.log` in commands

## Plans

Implementation plans live in repo root `plans/`. Update the plan status row in `plans/README.md` when completing work.
