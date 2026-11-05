# 26 — Visual polish: install wizard

Status: **complete**. Wave 12 (parallel with 24, 25, 27). Follow the shared rules in [24](24-polish-browse.md#shared-rules-for-slices-2427). Boards: `5A-Options`, `5B-Review`, `5C-Manual`, `6A-Progress`, `6C-Failure`.

## Owned files

`APP/components/marketplace/install/**`.

## Fixes

1. Layout per 5A: column `width: min(920px, 100%)` centered; breadcrumb "All plugins / <Plugin> / Install" above **one card** (16px radius, surface, border): header with "Install <Plugin>" (17px extra-bold) and the step list on the right (numbered circles; current = accent, done = check, clickable back), body, footer with right-aligned ghost Cancel + primary Continue/Install.
2. Options body: two columns — fields left (switch rows with label + muted description, labelled selects/segmented/inputs using controls package), diff right on `bg-canvas` with mono file name + muted "+N lines" and a code block (line gutter, add/del tints).
3. Review (5B), Manual (5C), Progress (6A), Failure (6C): reproduce each board's structure inside the same card shell (command block with copy, file diffs, provenance row, checkboxes as `HstCheckbox`; progress step rows with `HstPulsatingDisc`, times, bounded output log; failure header via `WorkbenchErrorState` with its action buttons).
4. No duplicated breadcrumb/back row.

## Acceptance

- Vue install specs pass; styling guard; ESLint clean.
