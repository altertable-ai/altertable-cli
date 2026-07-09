# Development

The CLI is a TypeScript project in `cli/`, run via Bun.

The Bun runtime used by contributors, CI, and release builds is pinned in [`.bun-version`](.bun-version) and mirrored by `packageManager` in `cli/package.json`.

GitHub Actions use the Node.js LTS version pinned in [`.node-version`](.node-version).

```bash
cd cli
bun install
bun run dev -- --help          # same as bin/altertable
bun test
bun run test:coverage          # coverage report
bun run typecheck
bun run lint                   # oxlint with type-aware rules (typescript-go)
bun run lint:fix               # oxlint --fix
bun run format                 # oxfmt
bun run format:check           # CI formatting check
bun run knip                   # required dead-code/unused-export check
bun run generate               # regenerate OpenAPI types
bun run spec:refresh           # fetch hosted OpenAPI spec (see specs/rest/SPEC.md) + generate
bun run build                  # bundle to cli/dist/cli.js
bun run pack:check             # build + dry-run pack (verify publish contents)
```

API specifications live in the `specs/` submodule ([altertable-client-specs](https://github.com/altertable-ai/altertable-client-specs)). Pin updates deliberately:

```bash
git submodule update --init --recursive
```

## Build and package

The JS bundle is the npm `bin` entry and a GitHub Release asset:

```bash
cd cli
bun run build                  # writes cli/dist/cli.js
bun run pack:check             # ensures dist/ is the only packed file
```

## Compile native binaries

Release and CI compile standalone executables (no Bun runtime required on the target machine).

The root `Makefile` is the easiest path. `make` (default target) detects the host OS/architecture and compiles the matching binary to `dist/altertable-<os>-<arch>`:

```bash
make                           # native binary for this host, e.g. dist/altertable-darwin-arm64
make cross                     # cross-compile all four released targets
make clean                     # remove dist/ and cli/dist/
make help                      # list targets
```

To invoke Bun directly instead:

```bash
cd cli
bun run build
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile ../dist/altertable-darwin-arm64
bun build --compile --target=bun-linux-x64 src/cli.ts --outfile ../dist/altertable-linux-x64
```

Smoke-test a compiled binary:

```bash
chmod +x ../dist/altertable-linux-x64
../dist/altertable-linux-x64 --version
../dist/altertable-linux-x64 --help
```

## Versioning

The CLI version comes from `cli/src/version.ts` (`altertable --version`). [release-please](https://github.com/googleapis/release-please) bumps `cli/package.json`, `cli/src/version.ts`, and `.release-please-manifest.json` on release PRs. Do not edit the version in one file without updating the others.

## Release workflow

On push to `main`, `.github/workflows/release-please.yml`:

1. Opens or merges a release-please PR that bumps version and changelog.
2. When a release is created, builds `cli/dist/cli.js`, compiles four native binaries, copies the bundle to `dist/altertable-cli.js`, writes `dist/checksums.txt` (SHA-256 for every asset), attests release assets, uploads all files to the GitHub Release, and publishes `@altertable/cli` to npm with provenance.

CI (`.github/workflows/test.yml`) runs the same `bun run build`, `bun run pack:check`, and native compile smoke tests for Linux and macOS release targets so release artifacts are verified before merge.

### npm publish

The `@altertable/cli` package is published to npm on each release by `.github/workflows/release-please.yml` using the `NPM_TOKEN` repository secret and npm provenance. Install globally with `npm install -g @altertable/cli`; npm installs require Bun at runtime, while prebuilt binaries do not.

### Update installer

`altertable update --install` is origin-aware because the CLI can run as either a native
release binary, a globally installed JavaScript package, or a source checkout. Each origin
needs a different safe update path:

- compiled release binaries use GitHub release assets, verify `checksums.txt`, and replace the binary with a backup/rename flow;
- npm-style JavaScript installs run the detected package manager globally and verify `altertable --version`;
- Bun/source checkouts are rejected for `--install-method auto` so development trees are updated with git, not overwritten by release assets.

Keep updater tests hermetic. Use fake `fetch` implementations and temp executable scripts so tests do not depend on network access, release availability, or the developer's installed CLI.

## Credential storage

- **Non-secret config**: `~/.config/altertable/config`
- **Secrets**: macOS Keychain when available, otherwise `~/.config/altertable/credentials` (`chmod 600`)
- Override backend: `ALTERTABLE_SECRET_BACKEND=keychain|file`

## Local deployment endpoints

```bash
altertable profile --configure --api-key atm_xxxx --env production --control-plane-url http://localhost:13000
altertable profile --configure --user u --password p --data-plane-url http://localhost:15000
export ALTERTABLE_MANAGEMENT_API_BASE="http://localhost:13000"
export ALTERTABLE_API_BASE="http://localhost:15000"
```

Localhost HTTP works without `--allow-insecure-http`. For LAN or other non-localhost HTTP endpoints, pass `--allow-insecure-http` (not recommended for production).

### Self-signed HTTPS (e.g. `altertable login` against a local backend)

When the control plane serves HTTPS with a self-signed / local-CA certificate, the CLI's `fetch` (Bun) rejects it with `unable to get local issuer certificate` — e.g. the OAuth token exchange fails with `Request failed (network error): POST https://.../oauth/token`.

```bash
# Quick escape hatch: disable TLS verification for this process only
NODE_TLS_REJECT_UNAUTHORIZED=0 altertable login
```

`NODE_TLS_REJECT_UNAUTHORIZED=0` turns off certificate verification for **every** request in the process — keep it inline or scoped to a dev shell, never in a shared profile or CI.

## Verify (agents and contributors)

From repo root, one script mirrors CI (minus native binary compile):

```bash
./scripts/verify.sh --quick        # typecheck, lint, format, knip, coverage, openapi drift
./scripts/verify.sh                # + build, pack:check, top-level black-box tests
./scripts/verify.sh --integration  # + tests/integration.e2e.ts (requires mock at :15000)
```

See [AGENTS.md](AGENTS.md) and [cli/AGENTS.md](cli/AGENTS.md) for agent-oriented docs.

## Tests

Top-level black-box tests (configure, management, context, catalogs, lakehouse routing, scripting, profiles):

```bash
bun test tests/*.test.ts
```

### Shell completion

Shell completion scripts are generated from the Citty `CommandDef` tree in `cli/src/cli.ts`. The spec walker lives in `cli/src/lib/completion-spec.ts`; bash/zsh/fish formatters and shared path/flag helpers live in `cli/src/lib/completion-format.ts`. Command-specific flags are taken from `CompletionNode.flags` on each visited node; positional arguments and dynamic API values are not completed. When you change command structure, run `cd cli && bun test cli/tests/completion-spec.test.ts cli/tests/completion.test.ts`.

Integration tests against the mock server:

```bash
docker run -d --rm --name at-mock -p 15000:15000 \
  -e ALTERTABLE_MOCK_USERS=testuser:testpass \
  ghcr.io/altertable-ai/altertable-mock:latest
bun test tests/integration.e2e.ts
docker stop at-mock
```

Unit tests:

```bash
cd cli && bun test
cd cli && bun run test:coverage
```

## CLI spec conformance (lakehouse)

When bumping the `specs/` submodule, extend the mapped tests before merge.

| Spec requirement            | CLI surface                         | Unit tests                       | Black-box/integration |
| --------------------------- | ----------------------------------- | -------------------------------- | --------------------- |
| POST /query (streamed)      | `query` (`run` default leaf)        | `lakehouse.test.ts` stream tests | `integration.e2e.ts`  |
| POST /query (buffered json) | `query --format json`               | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| GET/DELETE /query/{id}      | `query show`, `query cancel`        | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| POST /append + GET /tasks   | `append`, `append status`           | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| POST /upload                | `upload`                            | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| POST /upsert                | `upsert`                            | `lakehouse.test.ts`              | `integration.e2e.ts`  |
