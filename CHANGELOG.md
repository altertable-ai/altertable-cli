# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/altertable-ai/altertable-cli/compare/altertable-cli-v1.0.0...altertable-cli-v1.1.0) (2026-07-01)


### Features

* add one-shot shell completion installer ([#9](https://github.com/altertable-ai/altertable-cli/issues/9)) ([3984fe8](https://github.com/altertable-ai/altertable-cli/commit/3984fe86807c3de4f70d2350d1296138c233c368))
* **cli:** support lakehouse upsert endpoint ([#5](https://github.com/altertable-ai/altertable-cli/issues/5)) ([d6ec3b8](https://github.com/altertable-ai/altertable-cli/commit/d6ec3b8630233b6f6dc9c99c0a6e1e0bb12719aa))
* improve human and agent experience ([#8](https://github.com/altertable-ai/altertable-cli/issues/8)) ([135414f](https://github.com/altertable-ai/altertable-cli/commit/135414fabfde46c03d2b3d04be3b2e9838a2ab8d))


### Bug Fixes

* **api:** normalize api args to ensure the HTTP verb is optional ([#11](https://github.com/altertable-ai/altertable-cli/issues/11)) ([78b32df](https://github.com/altertable-ai/altertable-cli/commit/78b32df88de1848c6898e9347222272a193b1c92))
* **api:** prevent wide API tables from soft-wrapping ([#13](https://github.com/altertable-ai/altertable-cli/issues/13)) ([56fbeb6](https://github.com/altertable-ai/altertable-cli/commit/56fbeb6ff3de90f46e94395d3a500db88371bedb))
* **ci:** verify executable step path ([#1](https://github.com/altertable-ai/altertable-cli/issues/1)) ([4044001](https://github.com/altertable-ai/altertable-cli/commit/40440010a4eef01178e1c34ad931ae7ccb4a0f05))
* tighten body validation and stream timeout handling ([#16](https://github.com/altertable-ai/altertable-cli/issues/16)) ([4c4ce08](https://github.com/altertable-ai/altertable-cli/commit/4c4ce080981af4499eefbfae4ce8d767440fb089))
* validate lakehouse upload files before streaming the payload ([#15](https://github.com/altertable-ai/altertable-cli/issues/15)) ([0e49b6e](https://github.com/altertable-ai/altertable-cli/commit/0e49b6eb019659293d6e2bfd44de016b31087425))

## [1.0.0] - 2026-06-26

First public release of the Altertable CLI — a TypeScript/Bun command-line tool for the Altertable data platform: lakehouse data plane and management REST API.

### Added

#### Lakehouse (data plane)

- `query` — run SQL with human layout (`--layout auto|table|line`), serialized output (`--format human|json|csv|markdown`), column selection, max width, and pager controls
- `append` — insert rows (async or `--sync`)
- `upload` — bulk file ingest with streaming upload support
- `query show` and `query cancel` — inspect and cancel running queries
- `append task` — poll append task status

#### Management (control plane)

- `context` — show active profile, environment, and authenticated identity
- `catalogs` — list and create catalogs
- `api` — HTTP invoker for the management REST API (`api <METHOD> /path`, bare paths default to `GET`, parameters infer `POST`, `-X/--method` overrides the method, `-f/--raw-field` for string parameters, `-F/--field` for typed parameters)
- `api routes` — list operations from the bundled OpenAPI spec; `api routes <operationId>` shows one route with path parameters
- `api spec` — print the bundled management OpenAPI specification (YAML or `--json`)

#### Configuration and authentication

- Dual-plane auth: management API key (Bearer) and lakehouse credentials (HTTP Basic)
- `configure` — interactive wizard or flag-based credential setup, with optional verification
- Named profiles with `profile use`, `profile list`, `profile show`, and `profile delete`
- Environment variable overrides for credentials and endpoints

#### Developer experience

- Shell completion for bash, zsh, and fish (commands, subcommands, and leaf-command flags)
- Global `--json` and `--agent` presets for structured output and scripting
- Stable exit codes and structured error envelopes
- `--debug` with verbose HTTP logging
- Configurable connect and read timeouts (`--connect-timeout`, `--read-timeout`, per-command `--read-timeout`)
- Self-contained release binaries for macOS (arm64, x64) and Linux (x64, arm64), plus a Bun JS bundle
