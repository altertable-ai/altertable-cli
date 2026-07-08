# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-26

First public release of the Altertable CLI — a TypeScript/Bun command-line tool for the Altertable data platform: lakehouse data plane and management REST API.

### Added

#### Lakehouse (data plane)

- `query` — run SQL with human layout (`--layout auto|table|line`), serialized output (`--format human|json|csv|markdown`), column selection, max width, and pager controls
- `append` — insert rows (async or `--sync`)
- `upload` — bulk file ingest with streaming upload support
- `query show` and `query cancel` — inspect and cancel running queries
- `append status` — poll append task status
- `schema` — list schemas, tables, and columns in a lakehouse catalog

#### Management (control plane)

- `context` — show active profile, environment, and authenticated identity
- `catalogs` — list and create catalogs
- `api` — HTTP invoker for the management REST API (`api <METHOD> /path`, bare paths default to `GET`, parameters infer `POST`, `-X/--method` overrides the method, `-f/--raw-field` for string parameters, `-F/--field` for typed parameters)
- `api routes` — list operations from the bundled OpenAPI spec; `api routes <operationId>` shows one route with path parameters
- `api spec` — print the bundled management OpenAPI specification (YAML or `--json`)

#### Configuration and authentication

- Dual-plane auth: management API key (Bearer) and lakehouse credentials (HTTP Basic)
- `configure` — interactive wizard or flag-based credential setup, with optional verification
- `login` and `logout` — browser-based OAuth authentication with profile-aware token storage
- Automatic lakehouse credential provisioning for OAuth sessions
- Named profiles with `profile use`, `profile list`, `profile show`, and `profile delete`
- Advanced profile workflows including `profile current`, `profile status`, `profile switch`, `profile env`, `profile direnv`, `profile create`, `profile update`, and `profile rename`
- Environment variable overrides for credentials and endpoints

#### Developer experience

- Shell completion for bash, zsh, and fish (commands, subcommands, and leaf-command flags)
- Global `--json` and `--agent` presets for structured output and scripting
- Stable exit codes and structured error envelopes
- `--debug` with verbose HTTP logging
- Configurable connect and read timeouts (`--connect-timeout`, `--read-timeout`, per-command `--read-timeout`)
- `update` — origin-aware update checks and self-install flows
- Self-contained release binaries for macOS (arm64, x64) and Linux (x64, arm64), plus a Bun JS bundle

### Changed

- Release automation publishes the npm package with provenance, attests GitHub release assets, and builds against a pinned Bun runtime.
- CI smoke-tests all released native binary targets, including macOS arm64 and x64.
- Supply-chain checks include Dependabot, CodeQL, and pull-request dependency review.
