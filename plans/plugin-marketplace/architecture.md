# Architecture and current seams

Surveyed on `527cae3b`. Line numbers are hints; reread before editing. `APP` = `packages/histoire-app/src/app`, `NODE` = `packages/histoire/src/node`.

## Existing seams to reuse

**Settings and rail**
- `APP/components/pages/settings/SettingsPage.vue:20-33` holds the async section map. Sections come from `APP/stores/settings.ts:29-39` (`SETTINGS_SECTIONS`).
- `PluginsSection.vue` lists `installedPlugins` with icon, name, "Built in" chip, description, docs/repo buttons, a gear for plugin settings sections, and a dev-only enable switch (`toggleId`). Staged toggles use a sticky "Apply and restart" bar driven by `usePluginToggles.ts` (POST `__histoire/plugins/toggle`, `sessionStorage` receipt, polls status, then `location.reload()`).
- Settings building blocks: `SettingsCard`, `SettingsRow`, `PluginIcon`.
- Rail: `APP/components/shell/rail-items.ts`, `AppRail.vue:50-60` (`badgeFor`/`toneFor`), `RailButton.vue` (7px dot; tones `danger|agent|attention|accent`). Counts come from `workbench.badges`, passed in `WorkbenchApp.vue:100`.

**Installed plugin data**
- `NODE/virtual/resolved-config.ts:20-29` emits `installedPlugins` from `virtual:$histoire-config`. The type is in `packages/histoire-app/src/virtual.d.ts:13`.
- `PluginMetadata` (`histoire-shared/src/types/plugin.ts:147`) has no version, package name, or official flag.
- `NODE/config/plugin-metadata.ts` falls back to the installed `package.json` via `findProjectPackageDirectories`.
- `NODE/config/plugin-toggle-inventory.ts` builds generation-scoped rows with `toggleId`. They hang off `ctx.pluginMetadata`, `ctx.pluginInventory` and `ctx.pluginToggle` (`NODE/context.ts`).

**Node ↔ app transport**
- UI channel over the Vite socket:
  - Server: `NODE/server/ui-channel/channel.ts` (`on(event, validate, handler)`, `send`, `onReady`, `addCleanup`), registered in `ui-channel/index.ts`.
  - Types: `histoire-shared/src/types/ui-channel.ts:126,146`, extended by declaration merging (see `ui-mcp.ts`).
  - Client: `APP/util/ui-channel.ts` (`sendUiEvent` with a 64 KB limit, `onUiEvent`, disconnect/reconnect).
- Correlated request → progress → result → cancel pattern: `NODE/server/ui-channel/screenshot-setup.ts` with `APP/components/canvas/toolbar/use-screenshot-setup.ts`. Copy it; don't invent a new transport.
- HTTP routes: `NODE/server/ui-channel/http.ts` (`registerUiHttpRoute`; the `plugins` namespace is reserved). Client: `APP/util/http-json.ts`.

**Config editing**
- `NODE/config/codemod/` (magicast): `editConfig`, `writeConfig` (hash guard and backup), `restoreConfigBackup`, `configFileHash`. Its allowlist (`paths.ts:4-11`) excludes `plugins`.
- `NODE/config/plugin-toggle-source.ts`: `analyzePluginSource` parses literal plugin arrays; `disablePluginEntry` / `enablePluginEntry`.
- `NODE/server/ui-channel/plugin-toggle-service.ts:70-130` (`applyPluginChanges`) is the reference safe-write flow: check the hash, edit, load a temporary copy next to the config, write, reload and compare identities, restore the backup on failure, keep a receipt that survives restart.

**Restart**
- The dev proxy watcher (`histoire-dev-proxy/src/config/watcher.ts`, inputs in `config/inputs.ts`) restarts on config change through `lifecycle/coordinator.ts`, which serializes and coalesces restarts.
- Browser-requested restart: `POST /__histoire/dev/restart`.
- Plugin toggles rely on the watcher restart, then poll a receipt.

**UI primitives**
- Native `<dialog>` with `showModal()` in `APP/components/embed/EmbedDialog.vue`, driven by `embed/controller.ts` and mounted in `WorkbenchApp.vue`.
- Popovers: `APP/components/base/popover/*`. Menus: `APP/components/menu/{ContextMenu,MenuItem,SubMenu}.vue`.
- Search: `fuse.js` (app dependency); search input pattern in `SearchPanel.vue:240`.
- States: `APP/components/shell/Workbench{Empty,Loading,Error}State.vue`. Busy indicator: `HstPulsatingDisc`.

**Stores**
- The pattern is factory plus provide/inject, with no Pinia (`stores/project-config.ts:44,163,168`), composed in `APP/standalone/workbench-stores.ts:16`.

**Router**
- `APP/standalone/navigation.ts` (`home`, `story`, `/settings/:section?`); the workbench calls `workbench.navigate('settings', section)`.

**Tests**
- App behavior specs: `packages/histoire-vue/src/__tests__/` (vitest and jsdom; examples `workbench-installed-plugins.spec.ts`, `workbench-plugin-settings.spec.ts`).
- Node specs: `NODE/__tests__/` (`plugin-toggle-service.spec.ts`, `plugin-inventory.spec.ts`).
- E2E: Cypress in `examples/vue3/cypress/e2e/`.

**Docs**
- `docs/guide/plugins/*.md`, `docs/reference/plugin-api.md`, `docs/reference/config-codemod.md`, `docs/guide/ui-settings.md`.

## Gaps this pack fills

- No catalog, registry client, version or official data.
- No package manager detection or install.
- No insertion or removal of plugin entries.
- No fullscreen modal.
- Official packages have no keywords or marketplace manifest.
- `histoire` has `cross-spawn` and `magicast`. The pack adds no new runtime dependency except `semver` (if it isn't already available in `histoire`'s dependency graph, add it to `histoire` only).

## New layout

```
histoire-shared/src/types/marketplace.ts      manifest + catalog DTOs (01)
histoire-shared/src/types/ui-marketplace.ts   UI channel events (01)
NODE/marketplace/
  channel.ts            registerMarketplaceChannels → each area's register fn (01)
  manifest/             validate package.json#histoire.marketplace (01)
  catalog/              official index, registry client, cache, search, signals (02)
  inventory/            installed ↔ catalog join, update availability (03)
  changes/              package manager detection, config insert/remove/options, diffs (04)
  jobs/                 job runner, steps, rollback, receipts, failure analysis (06)
  migrations/           declarative option migrations (12)
NODE/marketplace/catalog/official.json          generated bundled index (01 script, 02 consumer)
APP/util/marketplace-client.ts                  typed wrappers over sendUiEvent (01)
APP/stores/marketplace.ts                       modal + view state (05)
APP/components/marketplace/
  shell/      modal, header, view switch, stubs (05)
  browse/     All plugins, Discover, facets, no results (07)
  detail/     plugin page and tabs (08)
  install/    options, review, progress, failure, manual (09)
  spotlight/  post-install tour (11)
  update/     update dialog (12)
APP/components/pages/settings/plugins/          installed rows, manage menu, prefs (10)
```

## Data flow

1. Opening the modal: the store fetches the catalog page (`marketplace:catalog-query`) with the current preferences. The node joins it with the installed inventory and project signals.
2. Detail: `marketplace:plugin-detail` returns the manifest, versions, compatibility verdict and release notes.
3. Options/Review: `marketplace:plan` returns a `ChangePlan`: argv, file diffs, warnings, `manualReason?`. It is pure and writes nothing.
4. Install: `marketplace:job-start` (plan id plus a hash of the plan) leads to `marketplace:job-progress` events and then `marketplace:job-result`. The job receipt sits on disk under `node_modules/.cache/histoire/marketplace/`; the next generation completes "Loading plugin" from the inventory and pushes `marketplace:job-result` to reconnecting clients.
5. Spotlight: the app reads the latest completed receipt and resolves the contributions the new plugin actually registered in the extension host.

## Open risks owned by slices

- Package manager edits to `package.json` or the lockfile may trigger a watcher restart mid-job (06 must check `config/inputs.ts` and, if they do, hold restarts with a coordinator lease until the job writes the config).
- Registry search is rate-limited and slow. 02 bounds every request (5 s timeout, 1 h cache, stale-while-error).
- Non-literal plugin arrays (spread variables, conditional factories) make the config read-only for the marketplace. 04 classifies them, and the UI falls back to manual with the exact snippet.
