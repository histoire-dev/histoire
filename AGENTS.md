# Agent guidance

- Keep first-party user-facing UI copy in English. Avoid the word “preview” in visible text, accessible names, titles, status messages, and user-facing errors. Refer to a selected story variant, the canvas, or the action being performed.
- Keep technical identifiers, protocol values, internal cancellation messages, comments, and user-authored story content unchanged when they use “preview”.

## Workbench UI components

- Empty areas in the workbench (no search results, no variant selected, no docs, no events, ...) must use `WorkbenchEmptyState` from `packages/histoire-app/src/app/components/shell/WorkbenchEmptyState.vue` instead of ad-hoc muted paragraphs.
  - `icon`: offline Carbon glyph name (see `packages/histoire-shared/src/icons/icon-names.json`).
  - `title`: short headline, no trailing period.
  - Default slot: optional detail line. `actions` slot: optional follow-up buttons (flat `HstButton` gets accent color).
  - Example: `<WorkbenchEmptyState icon="search" title="No matches">Nothing for <q>{{ query }}</q></WorkbenchEmptyState>`.

- Panel and text loading placeholders must use `WorkbenchLoadingState` from `packages/histoire-app/src/app/components/shell/WorkbenchLoadingState.vue`.
  - `title`: short headline naming operation in progress. Default slot: optional detail.
  - Matches empty-state layout with `HstPulsatingDisc` (see below) and no icon badge background.
  - Keep controls skeletons, canvas loaders, inline button/tab/row indicators, and startup progress screen in their specialized forms.

- Every spinner, busy dot, or "running"/"working" indicator must use `HstPulsatingDisc` from `@histoire/controls/vue` (source: `packages/histoire-controls/src/components/HstPulsatingDisc.vue`). Applies to app (`histoire-app`) and native components (`histoire-vue`).
  - `size`: number (px) or CSS length; default `16`. Color follows `currentColor`.
  - Never add custom spin/rotate keyframes or animate status icons (e.g. `in-progress`) for loading.
  - Exception: thin indeterminate progress bars for long-running operations (e.g. `.histoire-tests-progress[data-running]` in `packages/histoire-vue/src/styles/tests.css`). Don't pair one with a disc in adjacent status text.
  - Inline usage: `<HstPulsatingDisc v-if="running" :size="12" />`; render functions: `h(HstPulsatingDisc, { size: 12 })`.
  - Full panel loading still goes through `WorkbenchLoadingState`, which wraps it.
