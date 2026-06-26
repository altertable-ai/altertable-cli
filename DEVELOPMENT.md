# Development

The CLI is a TypeScript project in `cli/`, run via Bun.

```bash
cd cli
bun install
bun run dev -- --help          # same as bin/altertable
bun test
bun run typecheck
bun run lint                   # oxlint with type-aware rules (typescript-go)
bun run lint:fix               # oxlint --fix
bun run format                 # oxfmt
bun run format:check           # CI formatting check
bun run generate               # regenerate OpenAPI types
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

Release and CI compile standalone executables (no Bun runtime required on the target machine):

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
2. When a release is created, builds `cli/dist/cli.js`, compiles four native binaries, copies the bundle to `dist/altertable-cli.js`, writes `dist/checksums.txt` (SHA-256 for every asset), and uploads all files to the GitHub Release.

CI (`.github/workflows/test.yml`) runs the same `bun run build`, `bun run pack:check`, and native compile smoke tests so release artifacts are verified before merge.

### npm publish

The `@altertable/cli` package is published to npm on each release. Install globally with `npm install -g @altertable/cli` (requires Bun 1.1+ at runtime).

## Credential storage

- **Non-secret config**: `~/.config/altertable/config`
- **Secrets**: macOS Keychain when available, otherwise `~/.config/altertable/credentials` (`chmod 600`)
- Override backend: `ALTERTABLE_SECRET_BACKEND=keychain|file`

## Local deployment endpoints

```bash
altertable configure --api-key atm_xxxx --env production --control-plane-url http://localhost:13000
altertable configure --user u --password p --data-plane-url http://localhost:15000
export ALTERTABLE_MANAGEMENT_API_BASE="http://localhost:13000"
export ALTERTABLE_API_BASE="http://localhost:15000"
```

Localhost HTTP works without `--allow-insecure-http`. For LAN or other non-localhost HTTP endpoints, pass `--allow-insecure-http` (not recommended for production).

## Verify (agents and contributors)

From repo root, one script mirrors CI (minus native binary compile):

```bash
./scripts/verify.sh --quick        # typecheck, lint, format, knip, unit tests, openapi drift
./scripts/verify.sh                # + build, pack:check, shell offline tests
./scripts/verify.sh --integration  # + integration_test.sh (requires mock at :15000)
```

See [AGENTS.md](AGENTS.md) and [cli/AGENTS.md](cli/AGENTS.md) for agent-oriented docs.

## Tests

Offline tests (configure, management, context, catalogs):

```bash
./tests/configure_test.sh
./tests/management_test.sh
./tests/context_test.sh
./tests/catalogs_test.sh
./tests/scripting_test.sh
./tests/profile_test.sh
```

### Shell completion

Shell completion scripts are generated from the Citty `CommandDef` tree in `cli/src/cli.ts`. The spec walker lives in `cli/src/lib/completion-spec.ts`; bash/zsh/fish formatters and shared path/flag helpers live in `cli/src/lib/completion-format.ts`. Command-specific flags are taken from `CompletionNode.flags` on each visited node; positional arguments and dynamic API values are not completed. When you change command structure, run `cd cli && bun test cli/tests/completion-spec.test.ts cli/tests/completion.test.ts`.

Integration tests against the mock server:

```bash
docker run -d --rm --name at-mock -p 15000:15000 \
  -e ALTERTABLE_MOCK_USERS=testuser:testpass \
  ghcr.io/altertable-ai/altertable-mock:latest
./tests/integration_test.sh
docker stop at-mock
```

Unit tests:

```bash
cd cli && bun test
```

## CLI spec conformance (lakehouse)

When bumping the `specs/` submodule, extend the mapped tests before merge.

| Spec requirement            | CLI surface                         | Unit tests                       | Shell/integration     |
| --------------------------- | ----------------------------------- | -------------------------------- | --------------------- |
| POST /query (streamed)      | `query run` via `lakehouseQueryAll` | `lakehouse.test.ts` stream tests | `integration_test.sh` |
| POST /query (buffered json) | `query run --format json`           | `lakehouse.test.ts`              | `integration_test.sh` |
| GET/DELETE /query/{id}      | `query show`, `query cancel`        | `lakehouse.test.ts`              | `integration_test.sh` |
| POST /validate              | `validate`                          | `lakehouse.test.ts`              | `integration_test.sh` |
| POST /append + GET /tasks   | `append`, `append task`             | `lakehouse.test.ts`              | `integration_test.sh` |
| POST /upload                | `upload`                            | `lakehouse.test.ts`              | `integration_test.sh` |
| POST /autocomplete          | `autocomplete`                      | `lakehouse.test.ts`              | —                     |
