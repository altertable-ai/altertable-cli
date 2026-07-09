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
bash -c 'mapfile -t tests < <(find "$PWD/tests" -maxdepth 1 -name "*.test.ts" | sort); bun test "${tests[@]}"'
bun test tests/integration.e2e.ts
```

## Architecture

- **Dual-plane auth**: lakehouse data plane (HTTP Basic) vs management REST (Bearer API key). See root README credential tables.
- **`CliRuntime` + `OutputSink`** (`src/lib/runtime.ts`): `defineAltertableCommand` injects `sink` into every command `run` handler. Commands pass `sink` to output helpers — not raw `console.log` / `console.error` (completion scripts are the exception; they must emit raw script text).
- **`writeCommandOutput`** (`src/lib/command-output.ts`): unified success output — raw API, normalized envelopes, tabular management, deletes. Accepts `sink` as the last argument; lib callers may omit it (defaults to `getOutputSink()`).
- Helpers: `writeManagementOutput`, `writeLakehouseOutput`, `writeJsonOrRaw` (thin wrappers around `writeCommandOutput`).
- **When to use `sink` directly**: bespoke output (custom tables, metadata messages) — `sink.writeJson`, `sink.writeHuman`, `sink.writeMetadata`.
- **When to use helpers**: API-shaped responses with `--json` parity — pass `sink` as the last argument.
- Lakehouse streaming/query formatting lives in `lakehouse-client.ts` and `query-format.ts`.

## Conventions

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
| `src/commands/*`                      | One file per top-level command group                       |
| `src/lib/*`                           | Shared clients, formatting, config, completion             |
| `src/generated/openapi-types.ts`      | Generated — run `bun run generate` after OpenAPI changes   |
| `src/generated/openapi-operations.ts` | Generated operation index for `api routes`                 |
| `tests/*.test.ts`                     | Bun unit tests under `cli/tests/`                          |
| `../tests/*.test.ts`                  | Black-box end-user CLI tests at repo root                  |
| `../tests/integration.e2e.ts`         | Mock-server lakehouse integration test                     |

**Largest/hot files** — read before large refactors: `lib/http.ts`, `lib/profile-configure-core.ts`, `lib/query-format.ts`, `lib/api-http.ts`.

| Module                                 | Role                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `commands/lakehouse.ts`                | Data-plane commands (query, upload, append, …)                                   |
| `commands/api.ts`                      | Management HTTP invoker (`api GET /path`), spec, routes                          |
| `lib/api-http.ts`                      | HTTP invoker logic for `api`                                                     |
| `lib/api-body.ts`                      | `--body`, `@file`, `-f key=value` body builders                                  |
| `lib/profile-configure-core.ts`        | Credential store (`configureRunSet`, show, clear)                                |
| `lib/profile-configure.ts`             | `profile --configure` dispatch (flags vs wizard, `--scope`) + interactive wizard |
| `lib/profile-configure-interactive.ts` | Wizard prompts + credential collection                                           |
| `lib/profile-status.ts`                | Post-configure credential verification (`configureVerify`)                       |
| `features/profile/model.ts`            | Profile store/inspect + credential presence (stored + env)                       |
| `commands/profile.ts`                  | Profile subcommands, `profile --configure`, `profile show`                       |
| `lib/lakehouse-client.ts`              | Lakehouse HTTP + query rendering                                                 |
| `lib/http.ts`                          | Shared HTTP transport, logging, mock file support                                |
| `lib/management-transport.ts`          | Management API HTTP transport                                                    |
| `lib/management-formatters.ts`         | Human formatters for identity and `catalogs`                                     |
| `lib/catalog-rows.ts`                  | Catalog list row builder for `catalogs list`                                     |
| `lib/errors.ts`                        | Exit codes, `CliError`, JSON error envelope                                      |
| `lib/completion-spec.ts`               | Walks Citty tree for shell completion                                            |

## Command tree

Source of truth: `src/cli.ts` + `commands/api.ts`. Verify with `bin/altertable --help`.

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
```

`query` exposes `run` as its Citty default leaf and takes the SQL statement as a bare positional. Prefer the public form `altertable query "…"` in docs, tests, and new call sites unless a test is explicitly covering the command tree shape. A bare statement is routed to `run` by `normalizeQueryInvocatorRawArgs` in `bootstrap`, mirroring the `api` command's rawArgs rewrite.

## Cookbook

### Recipe A — New top-level product command

1. Create `src/commands/myfeature.ts` exporting `myfeatureCommand` via `defineAltertableCommand`
2. Register in `src/cli.ts` `topLevelCommands`
3. Pass `sink` from `run({ sink })` to `writeCommandOutput` or plane-specific wrappers (`writeManagementOutput`, `writeLakehouseOutput`)
4. Management plane: `managementRequest()` from `lib/management-transport.ts`
5. Lakehouse plane: functions from `lib/lakehouse-client.ts`
6. Add unit test in `cli/tests/`; black-box test in `tests/` if integration-worthy
7. Flags on command `args` are picked up by `completion-spec.ts` — run completion tests after structural changes

Minimal pattern (management HTTP command):

```typescript
import { defineAltertableCommand } from "@/lib/command-context.ts";
import { writeJsonOrRaw } from "@/lib/command-output.ts";
import { formatWhoami, type WhoamiResponse } from "@/lib/management-formatters.ts";
import { managementRequest } from "@/lib/management-transport.ts";

export const myfeatureCommand = defineAltertableCommand({
  meta: { name: "myfeature", description: "…" },
  async run({ sink }) {
    const response = await managementRequest("GET", "/path");
    writeJsonOrRaw(response, (data) => formatWhoami(data as WhoamiResponse), sink);
  },
});
```

### Recipe B — New management REST operation

New API operations ship in `cli/openapi/openapi.yaml` (copied from the server). Run `bun run generate` to refresh types and `OPENAPI_OPERATIONS`. Integrators call them via HTTP — no new Citty subcommands:

```bash
altertable api routes                    # discover method + path
altertable api /whoami                   # default GET
altertable api -X GET /path -f q=value   # forced GET puts fields in the query string
altertable api POST /new_resource -f …   # invoke
```

Bump the OpenAPI spec and extend `openapi-http-conformance.test.ts` placeholder mapping if new path parameters appear.

### Recipe C — Change exit codes or JSON errors

1. Edit `src/lib/errors.ts` only
2. Update `cli/tests/errors.test.ts` and `tests/scripting.test.ts`
3. Update README scripting table — do not renumber existing codes

## Testing guide

| Change type          | Run                                                                       |
| -------------------- | ------------------------------------------------------------------------- |
| lib pure function    | `cd cli && bun test path/to.test.ts`                                      |
| command validation   | `commands-*.test.ts` pattern                                              |
| HTTP behavior        | mock file via `ALTERTABLE_MOCK_HTTP_FILE` (see `tests/helpers.ts`)        |
| end-to-end lakehouse | `./scripts/verify.sh --integration`                                       |
| completion structure | `bun test cli/tests/completion-spec.test.ts cli/tests/completion.test.ts` |

Test env vars: `ALTERTABLE_CONFIG_HOME`, `ALTERTABLE_SECRET_BACKEND=file`, `ALTERTABLE_MOCK_HTTP_FILE`, `ALTERTABLE_HTTP_LOG`.

Lakehouse endpoint coverage: [DEVELOPMENT.md spec conformance table](../DEVELOPMENT.md#cli-spec-conformance-lakehouse).

Example mock HTTP test pattern: `cli/tests/lakehouse.test.ts` sets `ALTERTABLE_MOCK_HTTP_FILE`. Root black-box tests use `tests/helpers.ts`.

## Invariants (do not break)

- Exit codes 0–10 stable (`errors.ts`)
- `--json`: success stdout, error stderr JSON envelope
- Dual-plane configure: one authentication mechanism per flag-based invocation; the interactive wizard may configure both planes in one session
- HTTP log redaction in tests (`setupHttpLog` / `readHttpLog` in `tests/helpers.ts`)
- `bin/altertable` launcher unchanged
- No raw `console.log` in commands except `completion.ts`

## Plans

Implementation plans live in repo root `plans/`. Update the plan status row in `plans/README.md` when completing work.
