# Altertable CLI

[![npm](https://img.shields.io/npm/v/@altertable/cli)](https://www.npmjs.com/package/@altertable/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Query and manage your Altertable data platform from the terminal.

---

- [Quick start](#quick-start)
- [Installation](#installation)
  - [npm](#npm)
  - [Prebuilt binaries](#prebuilt-binaries)
  - [From source](#from-source)
- [Authentication](#authentication)
  - [Management API key](#management-api-key)
  - [Lakehouse credentials](#lakehouse-credentials)
  - [Dual-plane model](#dual-plane-model)
  - [Profiles](#profiles)
  - [Credential precedence](#credential-precedence)
- [Commands](#commands)
  - [Lakehouse](#lakehouse)
  - [Management](#management)
  - [Shell completion](#shell-completion)
- [Global flags](#global-flags)
- [Scripting](#scripting)
- [Development](#development)

---

## Quick start

```bash
# 1. Install
npm install -g @altertable/cli

# 2. Configure credentials
altertable configure

# Or non-interactive (CI/scripts):
altertable configure --api-key atm_xxxx --env production
altertable configure --user your_username --password your_password

# 3. Verify (optional — the wizard verifies by default)
altertable context

# 4. Query
altertable query --statement "SELECT * FROM users LIMIT 10"
```

---

## Installation

### npm

```bash
npm install -g @altertable/cli
```

Requires [Bun](https://bun.sh) 1.1+ at runtime (used as the JS engine when running the npm package).

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

---

## Authentication

The CLI talks to two independent APIs with separate auth schemes:

| Plane                    | Purpose                                 | Auth           |
| ------------------------ | --------------------------------------- | -------------- |
| **Management (control)** | `context`, `catalogs`                   | Bearer API key |
| **Lakehouse (data)**     | `query`, `upload`, `upsert`, `append`   | HTTP Basic     |

Most users need both. Run the interactive wizard or configure each plane with flags:

```bash
# Interactive wizard (TTY) — configures management and lakehouse
altertable configure

# Plane-specific wizards
altertable configure management
altertable configure lakehouse

# Non-interactive (scripts/CI)
altertable configure --api-key atm_xxxx --env production
altertable configure --user your_username --password your_password
altertable configure --show

# Verify after flag-based configure
altertable configure --api-key atm_xxxx --env production --verify
```

Passing `--user` and `--api-key` in a single invocation is not allowed. Run two separate `configure` calls — one per plane.

### Management API key

```bash
altertable configure --api-key atm_xxxx --env production

# Pipe the key from a secret store
printf '%s' "$KEY" | altertable configure --api-key-stdin --env production
```

Or via environment variables:

```bash
export ALTERTABLE_API_KEY="atm_xxxx"
export ALTERTABLE_ENV="production"
```

### Lakehouse credentials

```bash
altertable configure --user your_username --password your_password
```

Prefer reading secrets from stdin to avoid exposing them in process listings:

```bash
printf '%s' 'your_password' | altertable configure --user your_username --password-stdin
printf '%s' "$KEY" | altertable configure --api-key-stdin --env production
```

Plane URLs default to HTTPS. Localhost HTTP (`http://localhost`, `http://127.0.0.1`) works without extra flags; other HTTP URLs require `--allow-insecure-http`.

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

- Separate `configure` invocations — lakehouse and management credentials coexist in the active profile.
- Within one `configure` invocation — only one plane may be written.
- Within the same plane — a new value replaces the previous one.
- Environment variables override stored credentials when set.
- `altertable configure --clear` removes **both** planes and resets endpoint overrides.

### Profiles

Named profiles store credentials and endpoint overrides per environment. Global display defaults (`query_layout`, `query_max_width`, `query_pager`) stay in the root config and apply to all profiles.

```bash
# Set up multiple environments
altertable configure --profile staging --api-key atm_xxx --env staging
altertable configure --profile production --api-key atm_yyy --env production

# Switch active profile
altertable profile use staging

# Use a profile for one command
altertable --profile production context

# Inspect profiles
export ALTERTABLE_PROFILE=staging
altertable profile list
altertable profile show staging
```

Profile selection precedence: `--profile` flag → `ALTERTABLE_PROFILE` env var → `active_profile` config → `default`.

| Scope                              | Keys                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| Global (root `config`)             | `active_profile`, `query_layout`, `query_max_width`, `query_pager` |
| Profile (`profiles/<name>/config`) | `user`, `api_key_env`, `api_base`, `management_api_base`           |

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
altertable query --statement "SELECT * FROM users LIMIT 10"

# Human layout and script-friendly formats
altertable query --statement "SELECT * FROM events LIMIT 3"
altertable query --statement "SELECT * FROM events LIMIT 3" --layout auto
altertable query --statement "SELECT * FROM events LIMIT 3" --layout table
altertable query --statement "SELECT * FROM events LIMIT 3" --layout line
altertable query --statement "SELECT * FROM events LIMIT 3" --columns uuid,event,timestamp
altertable query --statement "SELECT * FROM events LIMIT 3" --max-width 24

# Serialized output
altertable query --statement "SELECT 1" --format csv
altertable query --statement "SELECT 1" --format json
altertable query --statement "SELECT 1" --format markdown

# Long results — pipe through a pager
altertable query --statement "SELECT * FROM big_table" --pager always
altertable query --statement "SELECT * FROM big_table" --pager never

# JSON for scripting
altertable --json query --statement "SELECT 1"

# Agent-friendly preset (structured JSON, no pager or terminal styling)
altertable --agent query --statement "SELECT 1"
```

Use `--format human|json|csv|markdown` for serialized output (default `human`). Human output respects `--layout auto|table|line` (default `auto`), `--columns`, `--max-width`, and `--pager auto|always|never`. `auto` picks a table when it fits and line layout when the table would be too wide. `--format json|csv|markdown` skips pager and layout controls. For machine-readable query output, prefer `--format json` or the global `--agent` preset.

Set display defaults in `~/.config/altertable/config`:

```ini
query_layout=auto       # auto | table | line
query_max_width=32      # integer >= 8
query_pager=auto        # auto | always | never
```

**Append and upload**

```bash
altertable append --catalog my_cat --schema public --table users --data '{"id": 1}'
altertable append --catalog my_cat --schema public --table users --data '{"id": 2}' --sync

altertable upload --catalog my_cat --schema public --table users --mode overwrite --format csv --file data.csv
altertable upsert --catalog my_cat --schema public --table users --primary-key id --format csv --file data.csv
```

**Inspect async operations**

```bash
altertable query show <query-uuid>
altertable query cancel <query-uuid> --session-id <uuid>
altertable append task <task-id>
```

### Management

Product-level commands stay at the top level. The full management REST surface is available via `altertable api` (HTTP invoker):

```bash
altertable context
altertable catalogs list
altertable catalogs create --engine altertable --name "My Catalog"

# Explore the bundled OpenAPI contract
altertable api spec
altertable api spec --json   # raw JSON document
altertable api routes        # index of paths and methods
altertable api routes createDatabase

# HTTP calls — path is relative to /rest/v1 (base URL from config)
altertable api /whoami
altertable api GET /whoami
altertable api GET /environments/production/connections
altertable api GET '/environments/production/connections?limit=10'
altertable api -X GET /service_accounts -f label="CI Bot"
altertable api POST /service_accounts -f label="CI Bot"
altertable api /service_accounts -f label="CI Bot" -F enabled=true
altertable api POST /environments/production/databases -f name=Analytics
altertable api POST /environments/production/databases --body '{"name":"Analytics"}'
altertable api POST /environments/production/databases --body @payload.json
altertable api DELETE /service_accounts/sa_abc123
altertable api PATCH /environments/production/connections/conn_1 --body '{"name":"Renamed"}'
```

Use `--env <slug>` to substitute `{environment_id}` in paths copied from `api routes`. Prefer full paths like `/environments/production/...` when the environment is known.
The method defaults to `GET`, switches to `POST` when request parameters or a body are provided, and can be overridden with `-X/--method`. Use `-f/--raw-field` for string parameters and `-F/--field` for typed values (`true`, `false`, `null`, integers, or `@file`). Forced `GET` and `DELETE` requests put fields in the query string; `POST`, `PATCH`, and `PUT` use fields as the JSON body unless `--body`/`--input` is supplied, in which case fields become query parameters.

For advanced or provider-specific payloads, pass raw JSON with `--body` or `@file`:

```bash
altertable api POST /environments/production/connections --body @postgres-connection.json
```

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

For manual installs, generate the script without writing files:

```bash
# bash
altertable completion bash > ~/.local/share/bash-completion/completions/altertable

# zsh
altertable completion zsh > ~/.local/share/zsh/site-functions/_altertable

# fish
altertable completion fish > ~/.config/fish/completions/altertable.fish
```

Omit the shell name and the CLI detects it from `$SHELL`. Tab completion covers top-level commands, subcommands up to two levels deep, command-specific flags on leaf commands, and global flags (`--json`, `--agent`, `--debug`). Regenerate or reinstall scripts after upgrading the CLI.

---

## Global flags

These flags apply to every command and must be placed before the subcommand:

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
altertable query --statement "SELECT ..." --read-timeout 180
altertable --read-timeout 120 query --statement "SELECT ..."
altertable --connect-timeout 10 upload --catalog my_cat --schema public --table users --mode overwrite --format csv --file large.csv
altertable --connect-timeout 10 upsert --catalog my_cat --schema public --table users --primary-key id --format csv --file large.csv
```

Stream endpoints (lakehouse query streams) treat `--read-timeout 0` as unlimited once connected.

---

## Scripting

Use `--json` or `--agent` for machine-readable output. On failure the error is a JSON object on stderr; stdout remains empty.

### Output tiers

With `--json`, success stdout follows one of three contracts:

1. **Raw API** — verbatim API response body (most `api *` commands).
2. **Normalized query** — `{ metadata, columns, rows }` from `query --format json`, `query --json`, or `altertable --agent query` (stable scripting contract).
3. **CLI envelope** — CLI-shaped objects such as `{ catalogs: [...] }` from `catalogs list --json`, `{ profiles: [...] }` from `profile list --json`, or `{ profile, environment, principal, … }` from `context --json`.

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
if ! out=$(altertable --json context 2>err.json); then
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
