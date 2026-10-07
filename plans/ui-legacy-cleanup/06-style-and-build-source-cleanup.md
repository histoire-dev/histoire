# 06 — Styles and build source cleanup

Depends on: 05. Owner: CSS disposition, asset/build/watch audit and current architecture docs.

## Result

Active styles and source assets have known owners. Superseded standalone header/dialog/home styling stops loading. Build/watch retain required runtime outputs and licenses.

## Files

- `app/standalone/style.css` and its import in `standalone/mount.ts`.
- `packages/histoire-vue/src/styles/style.css` or existing tree style source for retained count rule.
- `app/style/{main,transitions,document}.pcss`, `controls.css`, `sandbox.css`, `README.md` as audit targets.
- `packages/histoire-app/{vite.config.ts,vite.embed.config.ts,scripts/copy.mjs,scripts/watchAndCopy.mjs,scripts/asset-path.mjs}` as build/watch audit targets.
- `plans/ui-redesign/architecture.md` and this folder's ledger/contracts. Do not rewrite old execution logs as if cleanup had existed then.

## Procedure

1. Search current native/app/runtime/controls/story consumers for every selector in obsolete `standalone/style.css`.
2. Remove header, dialog/search, old home and modal rules whose source consumers were deleted.
3. `.histoire-story-variant-count` still appears in native `HistoireStoryTree.ts`: move its existing rule to native style owner, scoped to the native tree/provider as appropriate without changing observable layout. Prefer existing tree styles over another stylesheet.
4. Once no live rule remains, delete `standalone/style.css` and its mount import together.
5. Audit main/prose/code/transition rules one by one. Check transition `name` values and generated/native markup, not only literal class matches. Remove obsolete pane-shadow/split-panel rules only when no current user remains.
6. Keep Tailwind generation, controls imports, fonts/tokens, document reset layer, sandbox styles, custom-controls appearance and dark mode. Runtime grid and commands still use `htw-` utilities.
7. Preserve CSS import ordering and all font/icon notices. Do not change bundling flags, aliases, dependency versions or CSS architecture as a cleanup shortcut.
8. Inspect asset copying/watch deletion behavior. Current watch code already removes unlinked copied assets; modify it only if a reproducible stale-file defect remains. Do not expand watch cleanup into unrelated generated-file deletion.
9. Update current architecture/style docs: remove obsolete wrapper paths, mark minimal host event fallback, distinguish retained runtime compatibility from removed UI. Do not alter earlier redesign test counts/status history.

## Validation

No CSS-class/style assertion tests. Validate through fresh CSS/app/embed builds and browser behavior/visual checks in slice 08:

- Light/dark workbench, native tree counts and command prompts.
- Root/nested-base sandbox grid, backgrounds/checkerboard/contrast and source copy.
- Custom controls appearance, overlays, fonts and scoped embedded themes.
- Toolbar popover/overflow geometry at narrow widths.

Use existing copy/watch tests if modified. If a new asset deletion behavior is required, test exact copied asset unlink while preserving unrelated files; do not mirror private implementation.

## Acceptance

Obsolete standalone style file/import gone; live count rule has native owner. Required CSS/fonts/licenses present in fresh dist. No Tailwind-prefix purge, global reset added to reusable parts, theme regression, or changed generated runtime path.
