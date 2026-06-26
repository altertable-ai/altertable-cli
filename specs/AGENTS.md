# AGENTS.md - Client Specs

This is the source of truth for Altertable SDK specifications. It is version-controlled and public. Every change is reviewed by the team via pull request.

## What this repo is

A pure specs repository: requirements, fixtures, constants, and test plans. No runtime code lives here. SDK repositories consume this as a pinned git submodule. The workspace bot (Albert) reads these specs to implement and update SDKs.

## Repository layout

```
├── AGENTS.md                      # This file
├── README.md                      # Public overview and submodule usage guide
├── http/
│   └── SPEC.md                    # HTTP transport requirements (shared by all SDKs)
├── lakehouse/
│   └── SPEC.md                    # Lakehouse API client spec
└── product-analytics/
    ├── SPEC.md                     # Product Analytics SDK spec
    ├── CONSTANTS.md                # Shared constants (storage keys, timing, event names)
    ├── TEST_PLAN.md                # Test plan for all SDK tiers
    └── fixtures/                   # JSON fixtures for unit and integration tests
```

## Contribution rules

### Treat spec changes as API changes

Every change here affects downstream SDKs that are already in production. Apply the same discipline you would to a public API:

- **Patch** (`v0.1.x`): Fix typos, clarify wording, add examples — no behavioral change.
- **Minor** (`v0.x.0`): Add new optional fields, new phases, new fixtures — backwards-compatible.
- **Major** (`vx.0.0`): Remove or rename fields, change required behavior, break existing SDK implementations.

### Always update tests and fixtures together with the spec

Never update `SPEC.md` without also updating:
- `TEST_PLAN.md` — reflect new or changed behaviors
- `fixtures/` — add or update JSON fixtures that validate the change
- `CONSTANTS.md` — update constants if values or names changed

### Tag every release

After merging a spec change, tag the commit with a semver version:

```bash
git tag v0.2.0
git push origin v0.2.0
```

SDK repositories pin to a tag — never a branch. Once a tag is pushed, treat it as immutable.

### Coordinate with the workspace after tagging

Albert detects new tags on each heartbeat poll by running `spec-status.sh` locally. It compares each SDK's pinned submodule against the latest tag in this repo and opens submodule-update PRs for any lagging SDK.

**Loop closure**: The spec-sync loop is not closed at "PR opened". It is closed only when every downstream repo in the workspace inventory is accounted for: either updated (PR merged), has an open update PR, or has an explicit blocker issue. Albert creates or updates a tracking issue with `spec-update` or `spec-outdated` until all repos are accounted for.

**Expected outcome**: Within the next heartbeat cycle, Albert will open PRs updating each outdated SDK to the new spec version.

**If no PRs appear within 24 hours**:
1. Check open issues labeled `spec-update` or `spec-outdated` in [albert-workspace](https://github.com/altertable-ai/albert-workspace) — if found, Albert is aware but blocked; check the issue for details and escalate to the team.
2. If no such issues exist, in albert-workspace run `bash scripts/spec-status.sh` to verify the drift is detectable. If the script reports outdated SDKs but no tracking issue exists, open an issue in albert-workspace to investigate (Albert may be down or the heartbeat may need attention).

### Never modify files inside `specs/` of an SDK repo directly

The `specs/` submodule in each SDK repo is read-only. All changes flow from this repo → tag → submodule update PR.

## Branch and PR conventions

- Branch naming: `feat/<short-desc>` or `fix/<issue-number>-<short-desc>`
- Commit messages: follow [Conventional Commits](https://www.conventionalcommits.org/)
- PR titles must also follow Conventional Commits, because Altertable repositories squash-merge and release-please uses the merged PR title as the release signal. Repositories that use release-please must enforce this with a GitHub Actions check using `amannn/action-semantic-pull-request@v5` on `pull_request_target` for `opened`, `edited`, and `synchronize`.
- PR description: state which SDKs are affected and whether it is a breaking change

## Links

- Workspace (Albert): [altertable-ai/albert-workspace](https://github.com/altertable-ai/albert-workspace)
- SDK repositories: see [sdk-sync inventory](https://github.com/altertable-ai/albert-workspace/blob/main/skills/sdk-sync/SKILL.md#repository-inventory)
