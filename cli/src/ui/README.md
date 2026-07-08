# CLI UI Architecture

The CLI UI layer is a small platform for declarative terminal output.

## Boundaries

- `ui/document.ts` defines display data only: documents, sections, rows, tables, and text blocks.
- `ui/renderers/*` turns display data into concrete output.
- `ui/terminal/*` owns terminal mechanics: ANSI styles, links, visible width, and table layout.
- `ui/shell/*` owns shell snippet data and rendering.
- `features/*/views.ts` builds feature-specific display data.
- `features/*/render.ts` renders feature display data for terminal output.
- `features/*/model.ts` owns feature data models and data assembly.

Feature models must not import `ui/*`. Feature views may import `ui/document.ts` and
terminal styling helpers when a displayed value needs color, links, or emphasis. Feature
renderers may import `ui/renderers/*`.

Commands should depend on feature models/services for data and feature renderers for human
output. Commands should not define tables, label rows, or shell snippets inline.
