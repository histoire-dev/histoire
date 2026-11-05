# 24 — Visual polish: shell and browse

Status: **complete**. Source and behavior checks complete; browser verification remains with the orchestrator. Wave 12 (parallel with 25, 26, 27). Browser review of the running app (2026-11-05) against the approved boards.

## Shared rules for slices 24–27

- **Reference = the board source.** Read the mockup markup and reproduce its structure, spacing, sizes, radii and states with `htw:` utilities and app tokens. Boards: `/tmp/claude-1000/-home-akryum-Projects-histoire/97b82a7d-e166-4b6f-84c2-df561e138677/scratchpad/artifact-files/56809524-fa6a-4eb5-bb0b-f0395ab57d77/project/<Board>.dc.html` (also `MarketHeader.dc.html`). Their CSS variables map to app utilities: `--canvas`→`canvas`, `--surface`→`surface`, `--border`→`border`, `--chip`→`chip`, `--input`→`input`, `--text`→`text`, `--body`→`body`, `--muted`→`muted`, `--accent`/`-soft`/`-text`→`accent`/`accent-soft`/`accent-text`, `--link`→`accent-link`, `--danger*`→`danger*`, `--warn`→`warn`, `--mark`→`warn/25`. Mockup `Manrope` = app sans; `JetBrains Mono` = `htw:font-mono`. Ignore mockup sample data, Rail and scrim.
- **No browser defaults.** The app has no preflight: every raw `<button>` must reset like existing app buttons (`htw:m-0 htw:p-0 htw:border-0 htw:bg-transparent htw:text-inherit htw:[font:inherit] htw:cursor-pointer` + `focus-visible` accent outline). Prefer `HstButton`, `HstButtonGroup`, `HstSwitch`, `HstSelect`, `HstCheckbox` from `@histoire/controls/vue` when one fits; no native unstyled `<select>`/checkbox.
- Primary actions use `HstButton color="primary"` (check the prop name in `packages/histoire-controls/src/components/button/HstButton.vue`). Chips: 22px pill, `bg-chip text-body`, 11px semibold; accent chip `bg-accent-soft text-accent-text`; outlined chip `bg-surface` + inset 1px border.
- Keep accessible names used by specs; update `packages/histoire-vue/src/__tests__/marketplace-*` only where structure legitimately changes (never weaken behavior assertions). Run Vue specs with `NODE_OPTIONS=--no-experimental-webstorage`.
- No visual/class assertions in tests. Light and dark must both work (tokens only, no hard-coded hex except tile tints).
- The user's watchers and dev server are running: never build, never touch `dist`.

## Owned files

`APP/components/marketplace/shell/{MarketplaceHeader,PluginTile,MarketplaceModal,MarketplaceBreadcrumb}.vue`, `APP/components/marketplace/browse/**`.

## Fixes

1. **Section switch:** Discover / All plugins becomes `HstButtonGroup` (inline, like Appearance's color scheme). The selected section must be obvious in both themes.
2. **Header** per `MarketHeader`: 64px, title 15px extra-bold, 340px search with border + `bg-input`, bordered `/` key, clear button only when there is a query, hide the native search cancel button (two clear icons today), divider, bordered `Esc` key + close icon.
3. **Modal body:** `bg-canvas` behind `bg-surface` cards (cards: 1px border, 14px radius).
4. **Global breadcrumb row** ("← Back @pkg") rendered by `MarketplaceModal` duplicates the detail/install breadcrumbs: remove it from the modal; slices 25/26 keep their own breadcrumb. Keep `MarketplaceBreadcrumb.vue` only if 25/26 import it (they own its content; coordinate by leaving its API unchanged).
5. **Plugin names** have a gray UA button background: reset (see rules); name is a link-style button, hover `accent-text`.
6. **Discover (2B):** content `max-width: 1100px` centered, 26px gaps. "For this project" title 15px extra-bold + outlined chips with proper labels (`Vue 3`, `Vite 8`, `Vitest`; fix `labels.ts`). Hero/picks per 2B when present (hero card: 48px tile, 18px title, reason accent chip, primary Install + ghost Details; picks: compact cards with small Install + reason chip). Collection rows: 15px title + "See all" link-style accent; **4-column compact link tiles** (34px tile, bold name, muted publisher line `Official` / `Official · installed` / publisher), whole tile opens details.
7. **All plugins (2A, superseded):** the user chose the 3A layout for every state (2026-11-05): the Filters aside and the result list are always shown, so the view never switches layout while searching. The category column and the card grid were removed.
   Original item: left category column 220px, `bg-surface`, right border, full height of the body; items 34px, count mono 11px right, active `accent-soft`/`accent-text` bold. Results header: muted count, "Works with <framework>" **switch** that toggles the detected frameworks filter, sort `HstSelect`. 3-column grid of cards per 2A: 40px tile, 14px extra-bold name + inline small Official chip, muted publisher, body description (min-height 2 lines), footer category chip + one chip per add kind, right side "Installed" accent chip with check icon or small Install button. Incompatible reason stays visible as muted text.
8. **Search/filter state (3A):** when a query or facet is active, the left column becomes the Filters aside (240px, surface, border-right): header "Filters" + ghost Reset, vertical fieldsets (legend 11px uppercase muted), checkbox rows 30px with mono count right (category as checkboxes or radio rows; framework shows "detected"). Active filters as removable accent chips next to the count. Results render as **one card list** of rows: 40px tile, name + mono package id + Official chip, description with `<mark>` (mark tone `bg-warn/25`, inherit color), add chips, small Install button. Remove the horizontal facet box.
9. **No results (3C):** column `max-width: 920px`, empty state as today, outlined "Try" chips, "Build it yourself" card (code icon tile, title, muted line "Workbench plugins add panes, inspector tabs and toolbar tools", small "Plugin guide" link button).
10. **PluginTile:** 10px radius (14px at 64), mono semibold monogram.

## Acceptance

- Vue marketplace specs pass (except the 2 known stale plugin-kit spotlight cases). Styling guard passes. ESLint clean on owned files.
