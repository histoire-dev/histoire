# 02 — App shell: rail, side panel host, and inspector frame

## Outcome and prerequisites

Depends on: 01.

`App.vue` renders the new shell: a 56px rail, one 280px side panel chosen from the rail, the main area (existing `RouterView` content for now), and a floating inspector frame. Panel collapse lives on the rail below the theme toggle. Static builds hide dev-only rail items. The existing story view still renders inside the main area until slices 04–06 replace it.

## Owned files

- Add `app/components/shell/{ShellLayout,AppRail,RailButton,SidePanelHost,InspectorFrame}.vue`.
- Add `app/stores/shell.ts` (`pane`, `panelOpen`, `inspectorOpen`; key `_histoire-ui-shell`) and `app/composables/shell.ts` (`useShell`).
- Update `app/App.vue` to use `ShellLayout`; remove the `main-horiz` `BaseSplitPane` and `AppHeader` from the desktop layout.
- Keep `AppLogo`; retire `AppHeader` and the mobile `Breadcrumb` only after a narrow-width fallback exists in this slice.
- Register pane components lazily: `stories` → existing `tree/StoryList` (restyled in 03); `search`, `tests`, `comments`, `mcp` → placeholders until their slices land.

## Tests first

1. Selecting a rail item sets `pane`, opens the panel if closed, and persists; reselecting the active item collapses the panel.
2. Collapse button toggles `panelOpen` and its accessible label/expanded state.
3. Static mode (`__HISTOIRE_DEV__ === false`) hides `tests`, `comments`, `mcp`; a persisted hidden pane falls back to `stories`.
4. Home rail item navigates to route `home`; Settings navigates to `settings` (route added in 12; until then disabled).
5. Theme toggle keeps `ctrl/meta+shift+d` and the existing storage key.
6. Width ≤ 640px: rail becomes a bottom bar or menu button and the side panel opens as an overlay; story selection closes it.

## Implementation steps

1. Build `ShellLayout` as CSS grid: rail, optional panel, main. The inspector frame is absolutely positioned inside main (12px inset), above the canvas, below popovers.
2. Rail items come from a small descriptor list `{ id, label, icon, devOnly, badge }`; badges come from store getters (tests failing, open comments, MCP active).
3. `InspectorFrame` renders a slot with header, close button, and scroll container; no drag handle and no pin.
4. Keep `SearchModal` mounted for ⌘K until slice 08 replaces it.
5. Move `data-test-id`s from `AppHeader` buttons to the rail equivalents (`search-btn`, dark toggle).

## Failure paths

Unknown persisted pane → `stories`. Missing `virtual:$histoire-stories` data still shows the shell with an empty panel and the existing `InitialLoading`.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Shell matches the rail/panel/inspector geometry in the design canvas in both themes.
- Static build shows Home, Stories, Search, theme, collapse, Settings only.
- Existing story view works unchanged inside the new shell; Cypress specs pass.

## Non-goals

Canvas, toolbar, inspector content, new panes' content.

## Handoff

`useShell` API, rail descriptor format, inspector frame slot contract, and z-index layering table (canvas < toolbar < inspector < popovers < menus < modals) for slices 04–17.
