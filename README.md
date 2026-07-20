# Altertable CLI

[![npm](https://img.shields.io/npm/v/@altertable/cli)](https://www.npmjs.com/package/@altertable/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Query and manage your Altertable data platform from the terminal.

---

- [Quick start](#quick-start)
- [Installation](#installation)
  - [Install script](#install-script)
  - [npm](#npm)
  - [Prebuilt binaries](#prebuilt-binaries)
  - [From source](#from-source)
  - [Updates](#updates)
- [Authentication](#authentication)
  - [Management API key](#management-api-key)
  - [Browser login (OAuth)](#browser-login-oauth)
  - [Lakehouse credentials](#lakehouse-credentials)
  - [Dual-plane model](#dual-plane-model)
  - [Profiles](#profiles)
  - [Credential precedence](#credential-precedence)
- [Commands](#commands)
  - [Lakehouse](#lakehouse)
  - [Management](#management)
  - [Diagnostics](#diagnostics)
  - [Shell completion](#shell-completion)
- [Global flags](#global-flags)
- [Scripting](#scripting)
- [Development](#development)

For the complete generated command contract, see [COMMANDS.md](COMMANDS.md).

---

## Quick start

```bash
# 1. Install
curl -fsSL https://install.altertable.ai | sh

# 2. Configure credentials
altertable profile configure

# Or non-interactive (CI/scripts):
altertable profile configure --api-key atm_xxxx --env production
altertable profile configure --user your_username --password your_password

# 3. Verify (optional — the wizard verifies by default)
altertable profile show

# 4. Query
altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 10"
```

---

## Installation

### Install script

Recommended for most users:

```bash
curl -fsSL https://install.altertable.ai | sh
```

### npm

```bash
npm install -g @altertable/cli
```

Requires [Bun](https://bun.sh) at runtime (used as the JS engine when running the npm package).

### Prebuilt binaries

Download the platform binary from [GitHub Releases](https://github.com/altertable-ai/altertable-cli/releases). Each release ships:

| Asset                     | Description                          |
| ------------------------- | ------------------------------------ |
| `altertable-darwin-arm64` | macOS Apple Silicon                  |
| `altertable-darwin-x64`   | macOS Intel                          |
| `altertable-linux-x64`    | Linux x86-64                         |
| `altertable-linux-arm64`  | Linux ARM64                          |
| `altertable-cli.js`       | Bun bundle (`bun altertable-cli.js`) |
| `checksums.txt`           | SHA-256 checksums for all assets     |
| `release-manifest.json`   | Versioned artifact and build metadata |

Verify and install:

```bash
shasum -a 256 -c checksums.txt --ignore-missing
chmod +x altertable-linux-x64
sudo mv altertable-linux-x64 /usr/local/bin/altertable
altertable --version
```

### From source

```bash
git clone https://github.com/altertable-ai/altertable-cli.git
cd altertable-cli
git submodule update --init --recursive
chmod +x bin/altertable
export PATH="$PWD/bin:$PATH"
altertable --version
```

### Updates

Update to the latest CLI release:

```bash
altertable update
altertable update --check  # check without installing
```

Install a specific older release with an explicit force:

```bash
altertable update 1.1.0 --force
```

`altertable update` automatically follows the current installation method:

- prebuilt release binaries update from GitHub Releases, verify `checksums.txt`, then replace the current binary atomically;
- npm-style installs use the package manager (npm, Bun, pnpm, or Yarn) and verify the installed `altertable --version`;
- source checkouts install the published CLI through the detected package manager.

The CLI also performs a silent daily update check after successful human-facing commands. Notices are written to stderr only, never to stdout, and are disabled for `--json`, `--agent`, CI, and non-TTY output.

Set `ALTERTABLE_NO_UPDATE_CHECK=1` or `ALTERTABLE_UPDATE_CHECK=never` to disable automatic checks.

---

## Authentication

The CLI talks to two independent APIs with separate auth schemes:

| Plane                    | Purpose                               | Auth                     |
| ------------------------ | ------------------------------------- | ------------------------ |
| **Management (control)** | `profile show`, `catalogs`            | Browser OAuth or API key |
| **Lakehouse (data)**     | `query`, `upload`, `upsert`, `append` | HTTP Basic               |

Most users need both. Run the interactive wizard or configure each plane with flags:

```bash
# Interactive wizard (TTY) — configures management and lakehouse
altertable profile configure

# Plane-specific wizards
altertable profile configure --scope management
altertable profile configure --scope lakehouse

# Non-interactive (scripts/CI)
altertable profile configure --api-key atm_xxxx --env production
altertable profile configure --user your_username --password your_password
altertable profile configure --data-plane-url https://api.example.com
altertable profile show

# Verify stored credentials
altertable profile status
```

Passing `--user` and `--api-key` in a single invocation is not allowed. Run two separate `profile configure` calls — one per plane.

### Management API key

```bash
altertable profile configure --api-key atm_xxxx --env production

# Pipe the key from a secret store
printf '%s' "$KEY" | altertable profile configure --api-key-stdin --env production
```

Or via environment variables:

```bash
export ALTERTABLE_API_KEY="atm_xxxx"
export ALTERTABLE_ENV="production"
```

### Browser login (OAuth)

Sign in interactively with your browser instead of pasting an API key:

```bash
altertable login          # opens your browser, stores an OAuth session
altertable logout         # clears stored credentials and settings for all profiles
```

### Lakehouse credentials

```bash
altertable profile configure --user your_username --password your_password
```

Prefer reading secrets from stdin to avoid exposing them in process listings:

```bash
printf '%s' 'your_password' | altertable profile configure --user your_username --password-stdin
printf '%s' "$KEY" | altertable profile configure --api-key-stdin --env production
```

Plane URLs default to HTTPS. `--data-plane-url` can be saved by itself without changing credentials; `--control-plane-url` must be saved with a management credential so failed login/configure attempts do not leave a stale control-plane override. Localhost HTTP (`http://localhost`, `http://127.0.0.1`) works without extra flags; other HTTP URLs require `--allow-insecure-http`.

Or via environment variables:

```bash
# Option 1: pre-encoded HTTP Basic token
export ALTERTABLE_BASIC_AUTH_TOKEN="your_basic_auth_token"

# Option 2: username/password
export ALTERTABLE_LAKEHOUSE_USERNAME="your_username"
export ALTERTABLE_LAKEHOUSE_PASSWORD="your_password"
```

### Dual-plane model

Rules for updating credentials:

- Separate `profile configure` invocations — lakehouse and management credentials coexist in the active profile.
- Within one `profile configure` invocation — only one plane may be written.
- Within the same plane — a new value replaces the previous one.
- Environment variables override stored credentials when set.
- `altertable logout` removes **both** planes and resets endpoint overrides for all profiles.

### Profiles

Named profiles store credentials and endpoint overrides per environment. Global display defaults (`query_layout`, `query_max_width`, `query_pager`) stay in the root config and apply to all profiles.

Profile names can be provided explicitly, or derived from an organization slug and environment as `<org>_<env>`. Derived names are normalized to lowercase safe profile names, for example `Acme` + `Production` becomes `acme_production`.

```bash
# Browser login creates or reuses the signed-in org_env profile and switches to it
altertable login

# Or store the signed-in session in the current profile
altertable login --replace-profile

# Set up multiple environments with explicit profile names
altertable profile configure acme_staging --api-key atm_xxx --env staging
altertable profile configure acme_production --api-key atm_yyy --env production

# Switch the sticky active profile
altertable profile switch acme_staging

# Or choose interactively
altertable profile switch

# Use a profile for one command
altertable --profile acme_production profile show

# Use a profile for the current shell or direnv
eval "$(altertable profile env acme_staging)"

# Inspect profiles
altertable profile list
altertable profile current
altertable profile status
altertable profile show acme_staging
```

Advanced profile commands manage endpoint overrides and inspect existing profiles:

```bash
# Verify credentials and show the profile (identity + credential details)
altertable profile status acme_staging

# Print a shell snippet for direnv or manual use
altertable profile env acme_staging

# Rename a profile
altertable profile rename acme_staging acme_stage
```

Profile selection precedence: `--profile` flag → `ALTERTABLE_PROFILE` env var → `active_profile` config → `default`.

| Scope                   | Stored there                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Global root `config`    | Active profile and display/update preferences such as query layout, query width, and update checks          |
| Profile-specific config | Credentials metadata, endpoint overrides, organization/principal metadata, and credential expiry timestamps |

`profile status` runs live credential verification and then renders `profile show` (identity and credential details, including OAuth and auto-provisioned lakehouse credential expiry when present) followed by the verification result. `profile show --config` additionally prints the config dir, profile config file, and secret store paths.

### Credential precedence

**Management plane**

| Priority    | API key                  | Environment slug      | Control-plane base               |
| ----------- | ------------------------ | --------------------- | -------------------------------- |
| 1 (highest) | `ALTERTABLE_API_KEY`     | `ALTERTABLE_ENV`      | `ALTERTABLE_MANAGEMENT_API_BASE` |
| 2           | profile secret `api-key` | profile `api_key_env` | profile `management_api_base`    |
| 3 (default) | —                        | —                     | `https://app.altertable.ai`      |

**Lakehouse plane**

| Priority | Credentials                                                       | Data-plane base             |
| -------- | ----------------------------------------------------------------- | --------------------------- |
| 1        | `ALTERTABLE_BASIC_AUTH_TOKEN`                                     | `ALTERTABLE_API_BASE`       |
| 2        | `ALTERTABLE_LAKEHOUSE_USERNAME` + `ALTERTABLE_LAKEHOUSE_PASSWORD` | profile `api_base`          |
| 3        | stored basic token / user+password                                | `https://api.altertable.ai` |

> **Note:** Setting `ALTERTABLE_ENV` overrides the slug in `/environments/{env}/…` paths without changing the Bearer token. Make sure the env var, stored `api_key_env`, and API key permissions all refer to the same environment.

You can also override endpoints per-command with flags:

| Purpose                    | Flag                  | Environment variable             |
| -------------------------- | --------------------- | -------------------------------- |
| Management / control plane | `--control-plane-url` | `ALTERTABLE_MANAGEMENT_API_BASE` |
| Lakehouse / data plane     | `--data-plane-url`    | `ALTERTABLE_API_BASE`            |

---

## Commands

### Lakehouse

**Query**

```bash
altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 10"

# Human layout and script-friendly formats
altertable query "SELECT event, user_id, timestamp FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10"
altertable query "SELECT event, user_id, timestamp FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --layout auto
altertable query "SELECT event, user_id, timestamp FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --layout table
altertable query "SELECT event, user_id, timestamp FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --layout line
altertable query "SELECT * FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --columns event,user_id,timestamp
altertable query "SELECT * FROM analytics.main.events ORDER BY timestamp DESC LIMIT 10" --max-width 24

# Serialized output
altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 100" --format csv
altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 100" --json
altertable query "SELECT id, email, plan FROM analytics.main.users LIMIT 100" --format markdown

# Long results — pipe through a pager
altertable query "SELECT * FROM analytics.main.orders ORDER BY created_at DESC" --pager always
altertable query "SELECT * FROM analytics.main.orders ORDER BY created_at DESC" --pager never

# JSON for scripting
altertable --json query "SELECT 1"

# Agent-friendly preset (structured JSON, no pager or terminal styling)
altertable --agent query "SELECT 1"
```

Human output is the default and respects `--layout auto|table|line`, `--columns`, `--max-width`, and `--pager auto|always|never`. Use `--format csv|markdown` for serialized text, or the global `--json`/`--agent` flags for structured JSON. Serialized output skips pager and layout controls.

Set display defaults in `~/.config/altertable/config`:

```ini
query_layout=auto       # auto | table | line
query_max_width=32      # integer >= 8
query_pager=auto        # auto | always | never
```

**Append and upload**

```bash
altertable append '{"event":"checkout_completed","user_id":"usr_123","revenue":99}' --to analytics.main.events
altertable append '[{"event":"page_view","user_id":"usr_123"},{"event":"signup","user_id":"usr_456"}]' --to analytics.main.events --sync

altertable upload orders.parquet --to analytics.main.orders --mode overwrite
altertable upsert users.csv --to analytics.main.users --key id
```

Upload mode defaults to `create`; valid modes are `create`, `append`, and `overwrite`.
Input format is inferred from `.csv`, `.json`, or `.parquet` and can be overridden
with `--format`. Targets use `catalog.schema.table`; percent-encode literal dots
inside a component, for example `customer%2E360.main.users`.

**Inspect async operations**

```bash
altertable query show <query-uuid>
altertable query cancel <query-uuid> --session-id <uuid>
altertable append status <append-id>
```

### Management

Product-level commands stay at the top level. The full management REST surface is available via `altertable api` (HTTP invoker):

```bash
altertable profile show
altertable catalogs
altertable catalogs create Analytics

# Explore the bundled OpenAPI contract
altertable api spec
altertable api spec --json   # raw JSON document
altertable api routes        # index of paths and methods
altertable api routes createDatabase

# HTTP calls — path is relative to /rest/v1 (base URL from config)
altertable api /whoami
altertable api /environments/production/connections
altertable api '/environments/production/connections?limit=10'
altertable api /service_accounts -f label="CI Bot"
altertable api /environments/production/databases -f name=Analytics -F read_only=false
altertable api /environments/production/databases --input create-analytics-catalog.json
altertable api "/service_accounts/$SERVICE_ACCOUNT_ID" -X DELETE
altertable api "/environments/production/connections/$CONNECTION_ID" -X PATCH --input rename-warehouse-connection.json
```

Use `--env <slug>` to substitute `{environment_id}` in paths copied from `api routes`. Prefer full paths like `/environments/production/...` when the environment is known.
The method defaults to `GET`, switches to `POST` when request parameters or input are provided, and can be overridden with `-X/--method`. Use `-f/--raw-field` for strings and `-F/--field` for typed values (`true`, `false`, `null`, integers, or `@file`). Forced `GET` and `DELETE` requests put fields in the query string; `POST`, `PATCH`, and `PUT` use fields as the JSON body unless `--input` is supplied, in which case fields become query parameters.

For advanced or provider-specific payloads, read JSON from a file or stdin with `--input`:

```bash
altertable api /environments/production/connections --input postgres-connection.json
printf '%s' '{"name":"Analytics"}' | altertable api /environments/production/databases --input -
```

### Diagnostics

Run read-only checks against the selected profile, credential store, and both API
planes:

```bash
altertable doctor
altertable doctor --offline
altertable --json doctor
```

`--offline` validates only local configuration and credential presence. Network
checks use the global `--connect-timeout` and `--read-timeout` values. Doctor
findings do not refresh OAuth tokens, provision lakehouse credentials, or modify
profile files. A completed diagnostic exits successfully even when its report is
unhealthy; scripts should inspect the JSON `healthy` field.

### Shell completion

Install completion for bash, zsh, or fish:

```bash
altertable completion install
```

The CLI detects your shell from `$SHELL`, writes the completion script to the
standard user directory, and updates your shell startup file when bash or zsh
needs it. Open a new terminal, or reload your shell, to start using completion.

You can also choose a shell explicitly:

```bash
altertable completion install zsh
altertable completion install fish
```

If you need a manual install, generate the script without writing files:

```bash
# bash
altertable completion generate bash > ~/.local/share/bash-completion/completions/altertable

# zsh
altertable completion generate zsh > ~/.local/share/zsh/site-functions/_altertable

# fish
altertable completion generate fish > ~/.config/fish/completions/altertable.fish
```

Running bare `altertable completion` prints concise install and generation guidance.
Tab completion covers top-level commands, nested subcommands, command flags, and
global flags (`--json`, `--agent`, `--debug`). Regenerate or reinstall scripts
after upgrading the CLI.

---

## Global flags

These flags apply to every command and may be placed before or after commands:

| Flag                    | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `--profile <name>`      | Use a named profile for this invocation                                     |
| `--json`                | Output raw JSON (machine-readable success; JSON error envelope on stderr)   |
| `--agent`               | Agent preset: structured JSON output, no pager, colors, or terminal styling |
| `--debug`, `-d`         | Enable debug output                                                         |
| `--connect-timeout <s>` | HTTP connect timeout in seconds (default: `5`)                              |
| `--read-timeout <s>`    | HTTP read timeout in seconds (default: `60`; `0` = unlimited for streams)   |

Per-request read timeout on `query`, `upload`, and `upsert`:

```bash
altertable query "SELECT * FROM analytics.main.orders ORDER BY created_at DESC" --read-timeout 180
altertable --read-timeout 120 query "SELECT * FROM analytics.main.events ORDER BY timestamp DESC"
altertable upload orders.parquet --to analytics.main.orders --mode overwrite --connect-timeout 10
altertable upsert users.csv --to analytics.main.users --key id --connect-timeout 10
```

Stream endpoints (lakehouse query streams) treat `--read-timeout 0` as unlimited once connected.

---

## Scripting

Use `--json` or `--agent` for machine-readable output. On failure the error is a JSON object on stderr; stdout remains empty.

### Output tiers

With `--json`, success stdout follows one of three contracts:

1. **Raw API** — verbatim API response body (most `api *` commands).
2. **Normalized query** — `{ metadata, columns, rows }` from `query --json` or `query --agent` (stable scripting contract).
3. **CLI envelope** — CLI-shaped objects such as `{ catalogs: [...] }` from `catalogs --json`, `{ profiles: [...] }` from `profile list --json`, or `{ cli_config, profile, details }` from `profile show --json`.

Human mode defaults management list/get output to tables unless `--format` is set.

### Exit codes

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| `0`  | Success                                    |
| `1`  | Usage, validation, or unexpected CLI error |
| `2`  | Authentication failed (HTTP 401)           |
| `3`  | Permission denied (HTTP 403)               |
| `4`  | Not found (HTTP 404)                       |
| `5`  | Conflict (HTTP 409)                        |
| `6`  | Validation error (HTTP 422)                |
| `7`  | Rate limited (HTTP 429)                    |
| `8`  | Server error (HTTP 5xx)                    |
| `9`  | Network or timeout error                   |
| `10` | Configuration error (missing credentials)  |

### Error envelope

JSON error objects on stderr have the following fields: `error` (always `true`), `code` (stable snake_case identifier), `message`, `exit_code`, and optional `details` and `status`.

```bash
if ! out=$(altertable --json profile show 2>err.json); then
  code=$(jq -r .exit_code err.json)
  msg=$(jq -r .message err.json)
  echo "Failed ($code): $msg" >&2
  exit "$code"
fi
echo "$out" | jq .
```

Without `--json`, errors are printed as `[ERROR] …` lines on stderr.

---

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md).

## License

MIT
