# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/altertable-ai/altertable-cli/compare/v1.0.0...v1.1.0) (2026-07-10)


### Features

* allow to attach all available catalogs ([#44](https://github.com/altertable-ai/altertable-cli/issues/44)) ([d3b42c2](https://github.com/altertable-ai/altertable-cli/commit/d3b42c29b1e3403930e9f7e64237d2190ffcc3b8))


### Bug Fixes

* harden profile reuse and uniformize profile display and reuse ([#45](https://github.com/altertable-ai/altertable-cli/issues/45)) ([23ca8f1](https://github.com/altertable-ai/altertable-cli/commit/23ca8f1eadad316bbeab1f7ffab8166731c68a36))
* **release:** narrow release workflow to published tags ([#40](https://github.com/altertable-ai/altertable-cli/issues/40)) ([f224328](https://github.com/altertable-ai/altertable-cli/commit/f224328f3e70b137c5cfbcdc5790b8031cfde71c))
* subsequent login mixing current profile ([#46](https://github.com/altertable-ai/altertable-cli/issues/46)) ([992aaee](https://github.com/altertable-ai/altertable-cli/commit/992aaeeee25a2d1c7d548525a0ffeddbd115d40a))

## [1.0.0] - 2026-07-09

First public release of the Altertable CLI: a production-ready terminal for querying
Altertable lakehouses, managing control-plane resources, and operating reliably from
developer laptops, CI jobs, and agent workflows.

### Highlights

- One CLI for both Altertable planes: lakehouse SQL/data movement and management REST operations.
- Profile-first authentication with browser OAuth, API keys, lakehouse credentials, and explicit environment targeting.
- Human-friendly output by default, with stable JSON envelopes and `--agent` mode for automation.
- Self-update, shell completion, prebuilt release binaries, npm provenance, release asset checksums, and supply-chain attestation from day one.

### Added

#### Installation, updates, and automation

- Primary installer at `install.altertable.ai` for the default CLI install path.
- Prebuilt release binaries for macOS Apple Silicon, macOS Intel, Linux x64, and Linux ARM64, plus `checksums.txt`.
- npm package `@altertable/cli` with an `altertable` executable backed by a Bun bundle.
- `altertable update` with npm and GitHub release discovery, automatic update notices, cache controls, and origin-aware install flows for package-manager and native binary installs.
- Global flags for automation and diagnostics: `--json`, `--agent`, `--debug`, `--no-color`, `--profile`, `--connect-timeout`, and `--read-timeout`.
- Shell completion generation and installers for bash, zsh, and fish.
- Stable process exit codes, structured error envelopes, URL linkification, terminal styling controls, and pager-aware human output.

#### Profiles, configuration, and authentication

- `profile --configure` interactive wizard and non-interactive flags for setting management API keys, lakehouse credentials, endpoint overrides, and environment names.
- Browser OAuth login with PKCE via `login`, profile-aware token storage, `logout`, and automatic lakehouse credential provisioning for OAuth sessions.
- Dual-plane credential model: management API keys or OAuth Bearer tokens for the control plane, and HTTP Basic credentials for lakehouse APIs.
- Named profiles with `profile create`, `profile list`, `profile show`, `profile status`, `profile use`, `profile switch`, `profile current`, `profile env`, `profile direnv`, `profile rename`, and `profile delete`.
- Profile selection precedence for one-off commands, shell environments, and persisted active profiles.
- Secret input from stdin for API keys and passwords, macOS Keychain support when available, and file-backed credential storage with restricted permissions otherwise.
- HTTPS-by-default endpoint policy with explicit localhost support and `--allow-insecure-http` for intentional HTTP overrides.

#### Lakehouse (data plane)

- `query` for running SQL with positional statements, human layouts (`auto`, `table`, `line`), serialized output (`human`, `json`, `csv`, `markdown`), column selection, max-width controls, query IDs, session IDs, and pager controls.
- `query show` and `query cancel` for inspecting and cancelling running queries.
- `append` and `append status` for inserting JSON rows asynchronously or synchronously and polling append task state.
- `upload` for streaming local files into tables with create, append, and overwrite modes.
- `upsert` for file-based primary-key matching and row replacement.
- `schema` for listing schemas, tables, views, and columns in a lakehouse catalog.
- `duckdb` for opening a local DuckDB shell attached to an Altertable lakehouse catalog.
- Streaming NDJSON response handling, readable table rendering, line-layout fallback, markdown output, CSV output, and timeout controls tuned for long-running data operations.

#### Management (control plane)

- `profile show` and `profile status` for the active context, environment, authenticated identity, credential state, endpoint overrides, and verification results.
- `catalogs list` and `catalogs create` for managing Altertable catalogs in the current environment.
- `api` management REST invoker with method subcommands, bare-path `GET`, inferred `POST` when fields or bodies are supplied, `-X/--method` overrides, typed `-F/--field`, raw `-f/--raw-field`, JSON bodies, file bodies, stdin bodies, and environment path substitution.
- `api routes` for discovering operations from the bundled OpenAPI spec, including operation-specific route details and path parameters.
- `api spec` for printing the bundled management OpenAPI document as YAML or JSON.
- Generated OpenAPI operation metadata and conformance tests to keep CLI routing aligned with the shipped management API spec.

### Changed

- Release automation publishes the npm package with provenance, attests GitHub release assets, uploads checksummed binaries, and builds against a pinned Bun runtime.
- CI runs type checking, linting, formatting, OpenAPI generation drift checks, unit tests with coverage, package dry-run checks, and native binary smoke tests for released targets.
- Supply-chain coverage includes Dependabot, CodeQL, dependency review, pinned GitHub Actions, and release asset attestations.
