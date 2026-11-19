# Data app contributor router

| Change | Source and guidance | Focused check |
| --- | --- | --- |
| Package contracts, transport, or UI | [Data App repository](https://github.com/altertable-ai/data-app) | Package repository checks |
| Generated app defaults or author guidance | Published `@altertable/data-app-examples` package; change it in the SDK repository | Starter checks and CLI creation tests |
| Scaffold distribution or package upgrades | `../cli/src/commands/app/lib/distribution-source.ts`, `../cli/src/commands/app/lib/distribution.ts`, `../cli/src/commands/app/upgrade.ts` | Distribution, upgrade, and packaged-app tests |
| Consumer integration or browser behavior | `tests/`, generated `starter/` fixture | Browser tests against the published package |

See [development commands](README.md#develop). Keep SQL and metric definitions in app-owned source.
Only `starter/bun.lock` is versioned under `starter/`; setup generates the other files from npm.
Do not edit the generated fixture. Import only public package exports; local Bun serving uses `@altertable/data-app-bun`, and `mountDataApp`
owns stylesheet injection before mounting. Keep examples, preview, and browser-test package pins aligned, commit their
lockfiles, and preserve documentation links to installed package docs. Do not copy runtime source
into this repository or generated apps.
