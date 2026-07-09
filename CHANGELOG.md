# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-07-09)


### Features

* add `altertable duckdb` command ([#27](https://github.com/altertable-ai/altertable-cli/issues/27)) ([e114b11](https://github.com/altertable-ai/altertable-cli/commit/e114b11ae7c0dde20359dd03d6cefdb2405c1211))
* add `schema` command ([#21](https://github.com/altertable-ai/altertable-cli/issues/21)) ([f713a80](https://github.com/altertable-ai/altertable-cli/commit/f713a80c2909dd876348d4073c76bec71a467254))
* add first-class profile workflows and OAuth login profiles ([#23](https://github.com/altertable-ai/altertable-cli/issues/23)) ([3ce655f](https://github.com/altertable-ai/altertable-cli/commit/3ce655f9f914dadcb58e9761774e2462abd2a39a))
* add one-shot shell completion installer ([#9](https://github.com/altertable-ai/altertable-cli/issues/9)) ([3984fe8](https://github.com/altertable-ai/altertable-cli/commit/3984fe86807c3de4f70d2350d1296138c233c368))
* auto-provision ephemeral lakehouse credentials after login ([#22](https://github.com/altertable-ai/altertable-cli/issues/22)) ([d9d815f](https://github.com/altertable-ai/altertable-cli/commit/d9d815fc431fa3bea9f7cf8b9b8384ba99460108))
* avoid `--statement` flag for query ([#26](https://github.com/altertable-ai/altertable-cli/issues/26)) ([23c5dc8](https://github.com/altertable-ai/altertable-cli/commit/23c5dc8c0fc9abbec9b4e4c30574bd1f00d5a6a1))
* **cli:** add origin-aware CLI update command ([#18](https://github.com/altertable-ai/altertable-cli/issues/18)) ([5077028](https://github.com/altertable-ai/altertable-cli/commit/50770289ebdc3bcc9cec971c703ce06c52eedfdc))
* **cli:** support lakehouse upsert endpoint ([#5](https://github.com/altertable-ai/altertable-cli/issues/5)) ([d6ec3b8](https://github.com/altertable-ai/altertable-cli/commit/d6ec3b8630233b6f6dc9c99c0a6e1e0bb12719aa))
* implement `login` command ([#20](https://github.com/altertable-ai/altertable-cli/issues/20)) ([1300577](https://github.com/altertable-ai/altertable-cli/commit/13005776e4978bf0e2b6e2ac8cd1c37df700e13e))
* improve human and agent experience ([#8](https://github.com/altertable-ai/altertable-cli/issues/8)) ([135414f](https://github.com/altertable-ai/altertable-cli/commit/135414fabfde46c03d2b3d04be3b2e9838a2ab8d))
* refine shell completion UX ([#33](https://github.com/altertable-ai/altertable-cli/issues/33)) ([bd2c605](https://github.com/altertable-ai/altertable-cli/commit/bd2c605fac8d4b1943101f48f813608ffb048fa8))
* replace `configure` by `profile --configure` ([#28](https://github.com/altertable-ai/altertable-cli/issues/28)) ([fcf05b5](https://github.com/altertable-ai/altertable-cli/commit/fcf05b59741ced1aa7484404889e822f6a355614))


### Bug Fixes

* **api:** normalize api args to ensure the HTTP verb is optional ([#11](https://github.com/altertable-ai/altertable-cli/issues/11)) ([78b32df](https://github.com/altertable-ai/altertable-cli/commit/78b32df88de1848c6898e9347222272a193b1c92))
* **api:** prevent wide API tables from soft-wrapping ([#13](https://github.com/altertable-ai/altertable-cli/issues/13)) ([56fbeb6](https://github.com/altertable-ai/altertable-cli/commit/56fbeb6ff3de90f46e94395d3a500db88371bedb))
* **ci:** verify executable step path ([#1](https://github.com/altertable-ai/altertable-cli/issues/1)) ([4044001](https://github.com/altertable-ai/altertable-cli/commit/40440010a4eef01178e1c34ad931ae7ccb4a0f05))
* **cli:** remove active context from usage output ([#32](https://github.com/altertable-ai/altertable-cli/issues/32)) ([9d2a4ad](https://github.com/altertable-ai/altertable-cli/commit/9d2a4adcd3c2aa004737da495fa7c6a0159f5306))
* **lakehouse:** allow append task without append row flags ([#19](https://github.com/altertable-ai/altertable-cli/issues/19)) ([6ded957](https://github.com/altertable-ai/altertable-cli/commit/6ded9576f06a692abae6756b335e81365bb674d8))
* main concurrent merge issue ([#37](https://github.com/altertable-ai/altertable-cli/issues/37)) ([335252c](https://github.com/altertable-ai/altertable-cli/commit/335252c7b6cc053716a5f89739cea1b46e700c85))
* tighten body validation and stream timeout handling ([#16](https://github.com/altertable-ai/altertable-cli/issues/16)) ([4c4ce08](https://github.com/altertable-ai/altertable-cli/commit/4c4ce080981af4499eefbfae4ce8d767440fb089))
* validate lakehouse upload files before streaming the payload ([#15](https://github.com/altertable-ai/altertable-cli/issues/15)) ([0e49b6e](https://github.com/altertable-ai/altertable-cli/commit/0e49b6eb019659293d6e2bfd44de016b31087425))

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
