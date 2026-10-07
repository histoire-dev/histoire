# Agent guidance

- Keep first-party user-facing UI copy in English. Avoid the word “preview” in visible text, accessible names, titles, status messages, and user-facing errors. Refer to a selected story variant, the canvas, or the action being performed.
- Keep technical identifiers, protocol values, internal cancellation messages, comments, and user-authored story content unchanged when they use “preview”.

## Workbench UI components

- Empty areas in the workbench (no search results, no variant selected, no docs, no events, ...) must use `WorkbenchEmptyState` from `packages/histoire-app/src/app/components/shell/WorkbenchEmptyState.vue` instead of ad-hoc muted paragraphs.
  - `icon`: offline Carbon glyph name (see `packages/histoire-shared/src/icons/icon-names.json`).
  - `title`: short headline, no trailing period.
  - Default slot: optional detail line. `actions` slot: optional follow-up buttons (flat `HstButton` gets accent color).
  - Example: `<WorkbenchEmptyState icon="search" title="No matches">Nothing for <q>{{ query }}</q></WorkbenchEmptyState>`.
