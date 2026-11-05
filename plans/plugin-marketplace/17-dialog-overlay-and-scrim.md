# 17 — Dialog overlay target and scrim token

Status: **complete**. Dependencies: 01–13. Wave 7.

## Goal

Remove the marketplace's local workarounds by giving shared primitives what they lack:

- `WorkbenchPanelAction` can render its split menu inside a native `<dialog>` (top layer), so the plugin detail CTA uses it directly instead of the local `InstallSplitButton` split.
- A public scrim token replaces the hard-coded `black / 45%` backdrop in `MarketplaceModal` and `EmbedDialog`.

## Owned files

- `APP/components/shell/WorkbenchPanelAction.vue`: optional `overlayTarget?: HTMLElement | null` prop, default unchanged (`context.overlay ?? context.root`).
- `APP/style/theme.css`: `--histoire-scrim` token (light and dark values matching today's look) and its theme utility.
- `APP/components/marketplace/shell/MarketplaceModal.vue`, the `EmbedDialog` component file: use the scrim utility.
- `APP/components/marketplace/detail/{InstallSplitButton,DetailHeader,MarketplaceDetail}.vue`: replace the local split with `WorkbenchPanelAction` + `overlayTarget` (the dialog element, provided by the modal through the existing marketplace store/provide, no prop drilling). Delete `InstallSplitButton.vue` if it becomes empty.
- `AGENTS.md` (one line under `WorkbenchPanelAction`: `overlayTarget` for menus inside native dialogs).
- Specs in `packages/histoire-vue/src/__tests__/` for the detail CTA (extend `marketplace-detail` spec) and `WorkbenchPanelAction` (extend its existing spec if one exists).

## Implementation steps

1. Write failing specs:
   - Detail page inside the open modal: the CTA's options trigger opens a menu whose items are rendered inside the dialog element and are focusable/clickable; choosing "Install a specific version" (or the existing menu items) emits the same intent as today.
   - `WorkbenchPanelAction` without `overlayTarget` still mounts its popover in the provider overlay.
2. Add the prop and token; switch call sites.
3. Assert no visual tests (no class/style assertions).

## Acceptance criteria

- Specs pass; styling guard passes; no `<style>`, no `:deep()`, Tailwind `htw:` only.
- `rg "black/45" packages/histoire-app/src` returns nothing.

## Exclusions

- Redesigning dialog visuals.
