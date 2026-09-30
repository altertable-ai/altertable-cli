# Data app contributor router

| Change | Source and guidance | Focused check |
| --- | --- | --- |
| Package contracts, transport, or UI | [Data App repository](https://github.com/altertable-ai/data-app) | Package repository checks |
| Generated app defaults or author guidance | `starter/`; [app authoring router](starter/AGENTS.md) | Starter checks and CLI creation tests |
| Scaffold distribution or package upgrades | `../cli/src/commands/app/lib/distribution.ts`, `../cli/src/commands/app/upgrade.ts` | Distribution, migration, and packaged-app tests |
| Consumer integration or browser behavior | `tests/`, `starter/fixtures/` | Browser tests against the published package |

See [development commands](README.md#develop). Keep SQL and metric definitions in app-owned source.
Import only public package exports; local Bun serving uses `/server/bun`, and each browser entry
imports `/react/styles.css`. Keep starter and browser-test package pins aligned, commit their
lockfiles, and preserve documentation links to installed package docs. Do not copy runtime source
into this repository or generated apps.
