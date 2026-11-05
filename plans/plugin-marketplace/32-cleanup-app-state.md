# 32 — Cleanup: app marketplace state

Status: **complete**. Cleanup wave A (parallel with 29, 30, 31). Follow the shared rules in [29](29-cleanup-shared-logic.md#shared-rules-for-cleanup-slices-2934).

## Owned files

- `APP/stores/{marketplace,settings}.ts`, `APP/standalone/workbench-stores.ts`
- `APP/components/marketplace/shell/{marketplace-jobs,marketplace-prefs,MarketplaceModal,MarketplaceView}.{ts,vue}`, `APP/components/marketplace/browse/{catalog-client,use-catalog-query}.ts`, `APP/components/marketplace/detail/use-plugin-detail.ts`, `APP/components/marketplace/install/{use-install-wizard,use-install-plan}.ts`, `APP/components/marketplace/update/{use-update-dialog.ts,MarketplaceUpdateDialog.vue}`, `APP/components/marketplace/spotlight/{use-post-install-spotlight,use-spotlight-targets}.ts`
- `APP/components/pages/settings/plugins/{use-plugin-updates,use-settings-jobs}.ts`, `APP/components/pages/settings/{SettingsNav,PluginsSection}.vue`, `APP/components/shell/{AppRail,WorkbenchApp}.vue`
- Vue specs and fixtures covering these.

## Fixes

1. **Store-owned services:** create plugin updates, settings jobs and the catalog collection selection inside `createMarketplaceStore` with lifetime tied to `dispose()`; remove the `sessions`/`selections` WeakMaps, acquire/release counting and AppRail's keep-alive mounts. Settings nav badge: SettingsNav reads the store's update count generically (an optional `badge` on the section entry), not `item.id === 'plugins'`.
2. **Preferences have one owner:** `marketplace` becomes a normal `UiSettings` field with defaults in `defaults`, validated in the one hydration path; the store uses `toRef(settings.state, 'marketplace')`; remove the second storage parse, the `Object.assign` + `update({})` write-back and the reset special case.
3. **Jobs persistence:** settings jobs persist only their queue; read the request from the store's reviewed job; remove the duplicate `store.job.value = job`. One `jobProgressLabel(job)` helper (in `marketplace/shell/`) used by settings jobs, the update dialog and (slice 33 will switch `ProgressStep.vue`) — export it for that.
4. **Update dialog** uses `store.client.updateDetail`; drop its own client and the `transport` prop.
5. **Catalog client:** remove the test-only double-wrap `WeakSet`; Discover must not install pagination watchers just to select a collection (split `selectCollection` out of `useCatalogQuery`).
6. **View state:** remove the `'manual'` view (`startInstall(request, manualPlan?)` pushes one history entry); drop visibility re-checks below components that only render while open/active; `store.close()` aborts reads instead of the wizard's `visible` watcher. Preference watchers observe only `prefs.community` where only that affects the read.
7. **Spotlight:** attach the MutationObserver and scroll listener only while a tour is eligible/active, coalesce refreshes with `requestAnimationFrame`; persist the selected pane as the manifest `contribution` id and resolve `${pluginId}:${contribution}` instead of matching label text; one helper for npm package → workbench plugin id (used by the install wizard and spotlight).
8. **Bundle:** load `MarketplaceView` and the update dialog body with `defineAsyncComponent` so the marketplace UI isn't parsed at workbench boot.
