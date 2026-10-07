# 08 — Browser acceptance and closure

Depends on: 07. Owner: integrated acceptance, retained-code review and status records.

## Result

Final cleanup accepted on current dev/static workbench and retained runtime/framework/embed consumers. Documentation reports actual executed checks and any limits.

## Scope

- Existing Vue workbench/core browser suites and fixtures.
- Existing Svelte/React/Nuxt and embed/package consumer checks relevant to retained runtime imports.
- `implementation-validation.md`, `consumer-ledger.md`, README status in this folder.
- Current architecture docs amended in slice 06; no feature/UI redesign work added here.

## Browser acceptance

1. Dev workbench: Home/tree/Search/settings/story/Markdown navigation; current loading/empty states, narrow pane focus and Ctrl/Meta+K.
2. Single/grid/list/Matrix: selection, state edit acknowledgement, preset apply/reset, source read/copy, pan/zoom/fit, toolbar overflow and custom controls overlays.
3. Events: interaction from selected and non-selected grid actors, exact runtime/target attribution, navigation retirement, no duplicate event publication.
4. Tests in dev: project discovery/run/stop, inspector result projection, interrupted owner cannot publish successor results. Use existing controlled test fixtures; no credentialed ACP/MCP campaign added.
5. Static workbench: same supported navigation/state/docs/source/controls behavior; dev surfaces and channel actions retain existing absence.
6. Nested deployment base and hash/history mode: deep links, docs anchors, isolated sandbox links and return navigation remain exact.
7. Embedded provider: selection/controls/docs/events and disposal remain scoped; one provider cannot change another's route/storage/theme. Use existing embed consumer fixtures.
8. Runtime frameworks: existing Svelte/React/Nuxt smoke tests for actual story render/state/control bridge. Reuse current suites; record each framework separately and never infer acceptance from Vue alone.
9. Visual checks: light/dark, 390px narrow viewport, wide workbench, native tree counts, prompt form, sandbox background/checkerboard and current toolbar popovers. Capture inspectable screenshots. No class/style assertions or weakening selectors to force old markup.

## Review

- Re-read source/test diff for duplicate adapters/utilities, obsolete imports/exports, tests of deleted UI, and stale docs.
- Confirm each retained compatibility module has a named consumer in ledger.
- Confirm `app/router.ts`, old story/panel/search paths and old selection/test stores have no source/output references.
- Confirm runtime Pinia/settings/grid, generic render/mount, offline icons/aliases, fonts/licenses, preset storage, host event fallback, and current command primitives remain.
- Preserve unrelated changes and user staging; do not use broad clean/reset/stage commands.
- Distinguish unrelated baseline failures, environment blocks, cleanup failures and skipped runs. Do not mark all slices accepted while any required gate remains unresolved.

## Closure record

For each gate record command/environment, source identity, result, useful count, log/screenshot location and limitations. Record final retained compatibility list and measured bundle/file delta only if same-build measurement exists.

Update README to implemented only after source cleanup completes; mark accepted only after required checks pass. Historical redesign validation remains separate. No commit/push/tag/release/deploy in this slice.
