# 05 — Marketplace shell

Status: **complete**. Dependencies: [01](01-contracts-and-scaffolding.md). Wave 2. Marketplace Settings reset integrated in [slice 13](receipts/13.md).

## Goal

Fullscreen modal over the workbench (mockups 2A–6C frame), with header, view switching, store, and stub views for later slices.

## Owned files

- `APP/stores/marketplace.ts`: factory, provide and inject, composed in `APP/standalone/workbench-stores.ts`. Only this slice edits `workbench-stores.ts` in wave 2.
- `APP/components/marketplace/shell/`:
  - `PluginTile.vue` (logo or monogram tile, shared by 07–12)
  - `MarketplaceModal.vue`
  - `MarketplaceHeader.vue`
  - `MarketplaceBreadcrumb.vue`
  - `MarketplaceView.vue` (view switch)
  - `use-marketplace-keys.ts`
- Stub views that later slices replace (each renders a `WorkbenchEmptyState` with its view name):
  - `APP/components/marketplace/browse/MarketplaceAll.vue` and `MarketplaceDiscover.vue` (07)
  - `detail/MarketplaceDetail.vue` (08)
  - `install/MarketplaceInstall.vue` (09)
  - `spotlight/MarketplaceSpotlightHost.vue` (11)
  - `update/MarketplaceUpdateDialog.vue` (12)
- `APP/components/shell/WorkbenchApp.vue`: mount the modal, the spotlight host and the update dialog once.
- Specs `packages/histoire-vue/src/__tests__/marketplace-shell.spec.ts`. Shared test transport `packages/histoire-vue/src/__tests__/utils/marketplace-transport.ts`, a fake UI channel for 07–12.

## Store API (frozen for 07–12)

- **State:** `open`, `view: 'discover' | 'all' | 'detail' | 'install' | 'manual'`, `query`, `filters`, `sort`, `selectedId`, `installRequest?: ChangeRequest`, `job?: JobState`, `prefs: MarketplacePrefs`, `opener?: HTMLElement`, `updateTarget?: PluginId`.
- **Actions:** `openMarketplace(view?, opener?)`, `close()`, `showPlugin(id)`, `startInstall(request)`, `showManual(plan)`, `back()` (breadcrumb), `openUpdate(id)`, `setQuery`, `setFilters`.
- **Prefs** read from and write to the UI settings store (`stores/settings.ts`) under one key `marketplace`, with defaults from [contracts](contracts.md#catalog-dtos).
- **Job** subscribes once to `marketplace-client.subscribeJob`. On mount it asks `job-current`, so a running or just-finished job survives reload and restart.

## Implementation steps

1. Write failing behavior specs:
   - The opener button opens the modal.
   - The dialog has `role=dialog`, `aria-modal=true` and label "Plugin marketplace".
   - Esc closes, and focus returns to the opener.
   - "/" focuses search, except when typing in an input.
   - The Discover / All plugins tabs set `aria-current`.
   - Typing in search on Discover switches to All plugins and keeps the query.
   - Breadcrumb navigation works.
2. Implement the modal with native `<dialog>` and `showModal()` like `EmbedDialog.vue`:
   - 12px inset, 16px radius.
   - Workbench behind it is inert (native modal).
   - Scrim uses the existing token.
   - Tailwind `htw:` only; extend `app/style/theme.css` if a modal shadow or scrim token is missing.
3. Header per mockup `MarketHeader`:
   - Icon tile, title.
   - Segmented nav.
   - 340px search with a clear button, or the "/" hint when empty.
   - Divider, then close with the "Esc" hint.
4. Content area scrolls independently. The header stays fixed.
5. Expose `openMarketplace` to settings (10) through the store only. No prop drilling.

## Acceptance criteria

- Modal behavior specs pass.
- The workbench behind is untouched.
- Stubs render.
- No route changes.

## Exclusions

- Catalog rendering (07).
- Detail (08).
- Wizard (09).
