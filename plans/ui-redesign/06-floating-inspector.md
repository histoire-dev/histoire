# 06 — Floating inspector

## Outcome and prerequisites

Depends on: 02, 04.

The floating inspector shows the selected variant: header (story › variant, open isolated, close), text-only tabs Props / Docs / Events (count) / Tests (status), and a collapsible Source section at the bottom. Props shows the preset picker with reset, then each prop with its type and a typed control. The old side panel and split panes are removed.

## Owned files

- Add `app/components/inspector/{StoryInspector,InspectorHeader,InspectorTabs,PropsTab,SourceDrawer}.vue`.
- Reuse content components: `panel/{ControlsComponentProps,ControlsComponentPropItem,ControlsComponentState,StatePresets,StoryControlsSandboxIframe,StoryControlsOverlay,StoryDocs,StoryEvents,StoryEvent,StorySourceCode,StoryTests,StoryTestItem,StoryTestErrorItem}.vue`, restyled with tokens; split any that exceed 300 lines.
- Remove `panel/StorySidePanel.vue`, `panel/PaneTabs.vue`, and the `story-main`/`story-sidepane`/`story-single-main-split` split panes; remove the old `StoryView` viewer branch.
- Keep `data-test-id`s: `story-side-panel` (on the inspector root), `story-controls`, `story-controls-sandbox`, `story-source-code`, `story-tests-tab`, `event-item`.

## Tests first

1. Tabs map to `route.query.tab` exactly as before (`''`, `docs`, `events`, `tests`).
2. Editing a prop updates the selected frame's state through existing `STATE_SYNC`; presets save/restore with existing keys.
3. Events tab shows the unseen count badge and resets on variant change.
4. Tests tab shows pass/fail summary, failing assertion, code excerpt, re-run.
5. Source drawer: collapsed by default; expanded shows Variant (dynamic) and Story file (static) tabs, copy, open in editor (dev only); highlights the last edited prop line.
6. Closing the inspector persists `inspectorOpen=false`; selecting a frame does not reopen it; a toolbar/rail action reopens it.
7. Custom `#controls` slot still renders in its sandbox iframe with overlays positioned correctly inside the floating card.

## Implementation steps

1. Inspector reads selection via `useSelection`; no direct `router.currentRoute` reads in new components.
2. Prop rows: name (mono), type hint, control from `@histoire/controls` (text → HstText, enum → segmented `HstButtonGroup`, boolean → switch, number → HstNumber, other → HstJson).
3. Source drawer lazy-loads shiki like today; keep generation in one module for the embeddable SDK.
4. Open isolated uses the existing new-tab URL helper.

## Failure paths

Missing docs/source show empty states; source generation error is distinct from "no source". Controls iframe failure shows an inline error with retry.

## Validation commands

~~~bash
pnpm --filter @histoire/controls build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter @histoire/controls test
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-nuxt4 test:examples
~~~

## Acceptance criteria

- Inspector matches Story — Props/Docs/Events/Source boards in both themes.
- All existing control, preset, event, docs, source, and test behaviors preserved; Cypress specs pass.
- No split panes remain in the story view.

## Non-goals

Matrix base props (07), comments (17), HUD-style inline editing.

## Handoff

Inspector tab registry (for matrix mode), source drawer API, removed-file list.
