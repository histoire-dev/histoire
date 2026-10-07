# 05 — Toolbar, primitives and orphan helpers

Depends on: 03, 04. Owner: remaining legacy leaves and useful-helper test migration.

## Result

Retained primitive/helper has a current command, workbench, runtime, or supported compatibility consumer. Old responsive/background toolbar and split-pane/navigation primitives disappear.

## Files

Use slice 05 candidate/retain lists in inventory. Key boundaries:

- Keep `ToolbarNewTab.vue`; sandbox grid still uses it.
- Keep `BaseButton.vue`, `BaseKeyboardShortcut.vue`; command prompts still use them.
- Keep `PulsatingDisc.vue`, `base/overflow/*`, `base/popover/*`; current canvas toolbar/status uses them.
- Keep runtime source helpers and state utilities; generated imports use `util/docs.ts` and its dynamic-source dependencies.
- Keep `util/keyboard.ts` formatting, `util/select.ts`, `util/scroll.ts`, `util/hot.ts` where named current consumers remain.

## Tests first and migration

1. Inventory `preview-message.spec.ts`, `preview-state-sync.spec.ts`, `preview-state-roundtrip.spec.ts`, old request tests found by ledger, and `embed/dynamic-source-panel.spec.ts`.
2. Preserve security behavior at current boundary: wrong source/origin/marker/document rejected, stale requests cannot settle successors, exact selection/variant correlation, bounded timeout/cancellation, no state echo loop or initial empty-state overwrite.
3. Preserve dynamic Source loading/failed/retry/retired-selection behavior in current `SourceDrawer`/SDK tests. Keep `embed/dynamic-source.spec.ts` runtime derivation cases.
4. Update `core-tests/workbench-icons.spec.ts` to consume shared registry exports directly if `util/icons.ts` is removed. Preserve offline names, aliases, unknown-name behavior and any concurrent Tailwind-logo regression. Keep notices/assets added by other work.
5. Run current toolbar/overlay lifetime/bounds and command prompt tests. Do not write tests of old CSS classes or test that a list of deleted files is absent.

If current adapter lacks required security/correlation proof, extend existing suite using its real request/channel/owner harness before deleting old helper. Do not test an unrelated shallow mock to claim migrated coverage.

## Change

1. Refresh incoming source/build/generated consumers for each candidate. Missing imports alone are insufficient if explicit build entry or generated string references exist.
2. Delete old toolbar components except `ToolbarNewTab.vue`.
3. Delete unused base components from manifest. Leave current button/shortcut/overflow/popover/status primitives in place; wholesale `components/base/` deletion is prohibited by live consumers.
4. Delete orphaned old host bridge/request/state-sync/source-panel helpers after their useful tests migrate.
5. Delete `util/variant.ts`, `responsive.ts`, `tooltip.ts` if remaining consumers are all gone.
6. Remove `util/icons.ts` compatibility wrapper only after migrated tests and no packaged consumer; shared registry/API/assets remain.
7. For retained helpers remove only proven unused exports when small and behavior-preserving. For example, old `onKeyboardShortcut` may be orphaned while `formatKey` remains live; search all imports/re-exports before removing just that export. No new duplicate shortcut formatter.
8. Remove exclusive orphan fixtures/mocks; retain shared security/state/runtime fixtures.

## Validation

- Migrated frame/message/correlation/state/source/icon suites.
- Current command prompt, canvas toolbar overflow, overlay geometry/lifetime and icon controls suites.
- App/workbench/embed typechecks.
- Full retained source import scan has no dangling modules.

## Acceptance

Every surviving compatibility helper names its consumer. No selector/style-driven regression test added. Sandbox grid open-isolated/copy-source, command prompts, current toolbar overflow and runtime source generation remain supported.
