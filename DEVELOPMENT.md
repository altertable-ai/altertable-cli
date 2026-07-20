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
bun run generate               # regenerate OpenAPI types, operation index, and COMMANDS.md
bun run generate:commands      # regenerate only COMMANDS.md after command changes
bun run generate:check         # non-mutating generated-artifact drift check
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
bun run scripts/smoke-npm-bundle.ts
bun run pack:check             # ensures dist/ is the only packed file
```

## Compile native binaries

Release and CI compile standalone executables (no Bun runtime required on the target machine).

The root `Makefile` is the easiest path. `make` (default target) detects the host OS/architecture and compiles the matching binary to `dist/altertable-<os>-<arch>`:

```bash
make                           # native binary for this host, e.g. dist/altertable-darwin-arm64
make cross                     # build and checksum all released targets
make clean                     # remove dist/ and cli/dist/
make help                      # list targets
```

The typed manifest in `cli/src/release-manifest.ts` is the single source of truth for Bun targets,
public asset names, updater platforms, and CI runners. To invoke the release tooling directly:

```bash
cd cli
bun run release:verify
bun run release:build --native
bun run release:build --all
bun run release:build --bundle
bun run release:finalize
```

Release compilation requires the exact Bun version pinned in `.bun-version` and `packageManager`.
That reproducible build-toolchain pin is intentionally independent from the npm package's
`engines.bun` compatibility range (`>=1.1.0`). Standalone builds reject unresolved imports, disable
automatic `.env` and Bun configuration loading, and use the baseline Linux x64 target for broad CPU
compatibility.

Smoke-test a compiled binary through the same command used by CI:

```bash
bun run release:smoke --target=bun-linux-x64-baseline
```

## Versioning

The CLI version comes from `cli/src/version.ts` (`altertable --version`). [release-please](https://github.com/googleapis/release-please) bumps `cli/package.json`, `cli/src/version.ts`, and `.release-please-manifest.json` on release PRs. Do not edit the version in one file without updating the others.

## Release workflow

On push to `main`, `.github/workflows/release-please.yml`:

1. Opens or merges a release-please PR that bumps version and changelog.
2. When a release is created, keeps its GitHub Release in draft form and invokes the same reusable
   canonical verification workflow used by branch CI for the exact release tag.
3. Native runners compile and smoke-test each platform binary. The final job downloads those exact
   tested bytes, builds `cli/dist/cli.js` once, stages the identical bytes as
   `dist/altertable-cli.js`, and smoke-tests that npm bundle on both the release toolchain and Bun
   1.1.0. It then writes artifact-specific recipes in `dist/release-manifest.json`, verifies
   `dist/checksums.txt`, and attests and uploads every checksummed asset.
4. npm publication is idempotent: retries skip a package version already present in the registry.
   The completed GitHub Release becomes public only after npm publication succeeds.

Both `.github/workflows/test.yml` and the release workflow call `.github/workflows/verify.yml`, which
runs the repository and integration gates and executes the npm bundle on the minimum supported Bun
runtime. Branch CI then loads its native compile matrix from the typed release manifest and
smoke-tests every Linux and macOS release target. Main-branch verification is never cancelled by a
newer push. Workflows use explicit permissions, pinned runners/actions, concurrency controls, and job
timeouts; behavioral probes live in checked-in scripts rather than inline workflow programs.

### npm publish

The `@altertable/cli` package is published to npm on each release by `.github/workflows/release-please.yml` through npm trusted publishing. The workflow uses GitHub Actions OIDC, carries no long-lived npm publishing token, and receives automatic npm provenance. Install globally with `npm install -g @altertable/cli`; npm installs require Bun at runtime, while prebuilt binaries do not.

The npm package trust relationship must authorize GitHub repository
`altertable-ai/altertable-cli`, workflow file `release-please.yml`, and the `npm publish`
action. The cutover is intentionally staged:

1. Configure that trusted publisher on npm before merging the tokenless workflow.
2. Publish the next release and verify its npm provenance points to the expected
   GitHub Actions run.
3. Set npm publishing access to require 2FA and disallow token publishing.
4. Delete the unused `NPM_TOKEN` GitHub Actions secret and revoke its npm token.

Do not perform steps 3–4 until an OIDC publication succeeds. This preserves the
rollback path during migration without allowing the workflow to fall back to the
long-lived token.

### Update installer

`altertable update` is origin-aware because the CLI can run as either a native
release binary, a globally installed JavaScript package, or a source checkout. Each origin
needs a different safe update path:

- compiled release binaries use GitHub release assets, verify `checksums.txt`, and replace the binary with a backup/rename flow;
- npm-style JavaScript installs run the detected package manager globally and verify `altertable --version`;
- Bun/source checkouts install the published package globally without overwriting the development tree.

Keep updater tests hermetic. Use fake `fetch` implementations and temp executable scripts so tests do not depend on network access, release availability, or the developer's installed CLI.

## Credential storage

- **Non-secret config**: `~/.config/altertable/config`
- **Secrets**: macOS Keychain when available, otherwise `~/.config/altertable/credentials` (`chmod 600`)
- Override backend: `ALTERTABLE_SECRET_BACKEND=keychain|file`

## Local deployment endpoints

```bash
altertable profile configure --api-key atm_xxxx --env production --control-plane-url http://localhost:13000
altertable profile configure --user u --password p --data-plane-url http://localhost:15000
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
./scripts/verify.sh --quick        # typecheck, lint, format, knip, coverage, generated-artifact drift
./scripts/verify.sh                # + build, pack:check, top-level black-box tests
./scripts/verify.sh --integration  # + tests/integration.e2e.ts (requires mock at :15000)
```

See [AGENTS.md](AGENTS.md) and [cli/AGENTS.md](cli/AGENTS.md) for agent-oriented docs.

## Tests

Top-level black-box tests (configure, management, context, catalogs, lakehouse routing, scripting, profiles):

```bash
bun test "$PWD"/tests/*.test.ts
```

### Shell completion

Shell completion scripts are projected from the normalized `CommandDescriptor` rooted at `cli/src/cli.ts`. The spec walker, shell-neutral argv model, and formatters live in `cli/src/commands/completion/lib/`, beside their tests. Flags, finite positional values, and file operands come from shared argument metadata; freeform positionals and dynamic API values remain shell-owned. When you change command structure, run `cd cli && bun test src/commands/completion/lib/spec.test.ts src/commands/completion/index.test.ts`.

Integration tests against the mock server:

```bash
docker run -d --rm --name at-mock -p 15000:15000 \
  -e ALTERTABLE_MOCK_USERS=testuser:testpass \
  ghcr.io/altertable-ai/altertable-mock@sha256:2e85cecd30b582a28196fc7574b2c7ae323378ccf40abfe658e2692270799977
bun test "$PWD"/tests/integration.e2e.ts
docker stop at-mock
```

Unit tests:

```bash
cd cli && bun test
cd cli && bun run test:coverage
```

## CLI spec conformance (lakehouse)

When bumping the `specs/` submodule, extend the mapped tests before merge.

| Spec requirement            | CLI surface                  | Unit tests                       | Black-box/integration |
| --------------------------- | ---------------------------- | -------------------------------- | --------------------- |
| POST /query (streamed)      | `query "<SQL>"`              | `lakehouse.test.ts` stream tests | `integration.e2e.ts`  |
| POST /query (buffered json) | `query --json`               | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| GET/DELETE /query/{id}      | `query show`, `query cancel` | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| POST /append + GET /tasks   | `append`, `append status`    | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| POST /upload                | `upload`                     | `lakehouse.test.ts`              | `integration.e2e.ts`  |
| POST /upsert                | `upsert`                     | `lakehouse.test.ts`              | `integration.e2e.ts`  |
