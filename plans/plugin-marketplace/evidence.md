# Plugin marketplace execution evidence

Status: **receipts recorded** for slices 01–22. Waves 7–10 and current conformance boundaries recorded below; historical counts remain snapshots of their own runs. Full receipts live in [receipts/](receipts/).

Append a receipt only after executing a slice, using the fields in [validation](validation.md#receipt). Keep automated proof, manual proof, failures, skips and unrun checks separate. Never prefill success.

## Slice receipts

### 01 — Contracts, manifests, and scaffolding (2026-11-05)

- **Result:** complete. Full receipt: [receipts/01.md](receipts/01.md).
- **Checks:**
  - 33/33 marketplace specs and styling guard pass.
  - Shared `tsc` and source-graph typechecks pass, using the spec tsconfigs under `__tests__/marketplace/`.
  - ESLint passes; `git diff --check` is clean.
- **Deviations:**
  - The static virtual module exports `officialPlugins: PluginDetail[]`.
  - `ManualStep` is `{ title, code? }`.
  - Release-note kinds are `breaking | feature | fix`.
  - Migration remove and set ops use `path`.
  - Job errors are correlated by `requestId`/`jobId` on `job-state`.
- **Unrun:** default-config `tsc` for `histoire` and `@histoire/app`. They fail only on stale shared `dist` declarations and need a watcher refresh.

### 02–05 — Wave 2 (2026-11-05)

- **02 Catalog service:** complete ([receipt](receipts/02.md)).
  - 44 catalog specs pass.
  - Version ranges use an internal evaluator in `catalog/version.ts`, because `semver` can't be resolved from `histoire`. Full `node-semver` parity isn't claimed.
- **03 Installed inventory:** complete ([receipt](receipts/03.md)).
  - 35 inventory specs and 4 settings specs pass.
  - Added `pinned?` to inventory rows and to the `installedPlugins` declaration. `CatalogEntry.installed` has no `pinned` field.
- **04 Change planner:** complete ([receipt](receipts/04.md)).
  - 36 planner specs pass.
  - Plan hashes also cover the original package bytes and the lockfiles.
  - Community targets need catalog metadata already in the cache.
  - `migrate: true` produces `migration-manual` until 12 lands.
- **05 Marketplace shell:** complete ([receipt](receipts/05.md)).
  - 11 shell specs pass, plus a Chromium script check.
  - The scrim reuses the `EmbedDialog` treatment, because the theme has no scrim token.
- **Orchestrator integration:**
  - Removed the obsolete stub assertion from `__tests__/marketplace/channel.spec.ts`.
  - Moved the official-index test alias into `packages/histoire-vue/vite.config.ts` (`src/__tests__/utils/marketplace-official.ts`) and deleted the per-spec Vitest config.
  - Shell specs now use Map-backed storage, because jsdom on Node 26 exposes no `localStorage`. The existing `workbench-home-rail.spec.ts` fails for the same reason; that is pre-existing and unrelated.
  - Added `UiSettings.marketplace?` and removed the cast in `marketplace-prefs.ts`.
- **Combined checks after integration:**
  - `vitest run src/node/__tests__/marketplace`: 14 files, 113 tests pass.
  - Shell, installed-plugins and plugin-settings specs: 15 pass.
  - Shell source `tsc` passes.

### 06–08 — Wave 3 (2026-11-05)

- **06 Install jobs:** complete after integration ([receipt](receipts/06.md#integration)).
  - First pass was blocked: the restart lease needed parent/child IPC.
  - The orchestrator amended the contracts: restart through the watcher, `awaiting: 'continue' | 'restart'`, and `job-continue`.
  - The integration agent removed the lease, enabled live `job-start`, added the receipt TTL sweep, and fixed the planner config-file seam.
  - 54 jobs specs pass.
- **07 Browse and discover / 08 Plugin detail:** complete after integration ([07](receipts/07.md), [08](receipts/08.md)).
  - The 150 ms debounced client is wired into the store.
  - `filters.collection` works end to end.
  - Detail returns a typed `not-found` error and per-version `reason`.
  - 44 app specs pass; catalog plus styling-guard specs: 79 pass.
- **Orchestrator:**
  - Shared types: `filters.collection`, `versions[].reason`, the `not-found` code, the `job-continue` event and `JobState.awaiting`.
  - Updated plans 09–12 for the restart model.
  - Fixed the obsolete `client.spec.ts` expectations: an invalid plan gives `invalid`, and an idle `job-current` resolves `null`.
- **Combined checks:**
  - Node marketplace: 145/145.
  - App marketplace plus existing plugin settings: 48/48.
- **Open items:**
  - The planner should classify configs that import `package.json` as manual. The runner already rejects them safely before any mutation. Assigned to 13.
  - One `catalog-service.spec.ts` failure appeared once under combined load and passed on rerun. Watch for flakiness.
  - The `histoire-protocol/src/helpers/meta.ts:83` TS2322 error is pre-existing; it blocks the detail spec-inclusive typecheck.

### 09–10 — Wave 4 (2026-11-05)

- **09 Install wizard:** complete ([receipt](receipts/09.md)).
  - Covers Options with the live diff, Review, Progress, Failure with suggestion and retry, Manual, and the static flow.
- **10 Settings management:** complete after integration ([receipt](receipts/10.md)).
  - Covers installed rows, the More actions menu, preferences, sequential Update all, the rail dot, and the nav count.
- **Orchestrator:** added the `install/restart.ts` helper `requestDevRestart()` (`POST /__histoire/dev/restart`).
- **Integration agent:**
  - Added `continueJob` to the client.
  - The store now owns the restart observer, the restart policy and `postInstall { jobId, pluginId, openPane? }`, persisted in session storage.
  - Added `showPlugin(id, tab?)` and the update count next to Plugins in `SettingsNav`.
- **Checks:**
  - App marketplace plus plugin settings specs: 95/95 (18 files).
  - Node marketplace: 145/145.
  - Styling guard: 4/4.
- **Typechecks with test helpers included:** 4 pre-existing diagnostics outside marketplace files:
  - `histoire-plugin-kit` host: `create-host.ts:27`, `registry.ts:53`
  - `histoire-plugin-kit` render: `mount-manager.ts:121`
  - `histoire-protocol`: `meta.ts:83`

### 11–12 — Wave 5 (2026-11-05)

- **11 Post-install spotlight:** complete ([receipt](receipts/11.md)).
  - Contributions come from the live registry and are anchored via `data-histoire-contribution`.
  - The primary action ("Run audit") only appears for toolbar contributions with an explicit `command`.
  - Popover and custom toolbar items without the hook are skipped.
- **12 Updates and migrations:** complete ([receipt](receipts/12.md)).
  - Declarative migration ops are applied through the planner's `withMigrations` adapter.
  - Added `histoire:ui:marketplace-update-detail` locally, through declaration merging and a transport adapter.
  - With community off, release history is limited to the bundled current manifest.
  - Pinning to a lower version shows no downgrade warning yet.
- **Combined checks:** app marketplace plus plugin settings 117/117; node marketplace plus toggles and inventory 173/173.
- **Assigned to 13:**
  - Move the `update-detail` event into the shared types and add a client wrapper.
  - Make the planner treat configs that import `package.json` as manual.
  - Add a pin downgrade warning.

### 13 — Docs and conformance, and orchestrator final pass (2026-11-05)

- **13 Docs and conformance:** complete ([receipt](receipts/13.md)).
  - Moved the `update-detail` event into the shared types.
  - The planner and runner now fall back to the manual flow when a config imports `package.json`.
  - Added a pin downgrade warning.
  - Settings reset now covers marketplace preferences.
  - Added the popover spotlight anchor.
  - Docs, nav and `marketplace.cy.js` added.
- **Orchestrator fixes:**
  - Added `useOptionalMarketplaceStore()`. It replaces the try/catch injection in `AppRail` and `SettingsNav` that warned in shells without a marketplace store.
  - Updated the `workbench-plugins-config.spec.ts` expectation for the new `installedPlugins` fields.
- **`@histoire/vue` full suite:**
  - With `NODE_OPTIONS=--no-experimental-webstorage`: 181 files, 947/947 pass.
  - Without the flag, Node 26 shadows jsdom's `localStorage` and 106 tests across 22 files fail. Those are pre-existing specs.
- **`histoire` full default suite:** 2406 passed, 8 failed (3 files) before the spec update; `workbench-plugins-config` (2 of the 8) has since been fixed. The remaining 6 fail in two files outside this work:
  - `app-bundle-output.spec.ts` reads `histoire-app/dist/bundled`, which is stale from Nov 3.
  - `mcp/server-startup.spec.ts`: the mock Vite server lacks `config.base` in the untouched `registerPluginToggleHttp` (`server/index.ts:97`). Both files are unchanged from HEAD. It is not proven that this fails at HEAD.
- **Unrun:**
  - Browser walkthrough of the boards and dark mode
  - Cypress `marketplace.cy.js`
  - Docs build
  - Default-config `tsc` after the shared declarations refresh
  - Packaged CLI restart flow

  All of these need a rebuilt `dist` or a running dev server. None was available, and no build was run.

### 14–18 — Wave 7 (2026-11-05)

- **14 npm semver:** complete ([receipt](receipts/14.md)). Internal range parser replaced by direct npm semver; new adapter cases went from 8 failures / 20 passes to 28 passes. Initial concurrent-suite/source-type blockers are superseded by wave 10 checks below.
- **15 Official history:** complete ([receipt](receipts/15.md)). Committed version-scoped snapshots, immutable same-version snapshot CLI, generated history/versions, offline update/migration readers and peer advice. Seed files contain only actual current versions; no historical completeness claim.
- **16 Contribution relationships:** complete at source scope ([receipt](receipts/16.md)). Local `adds[].contribution`, same-plugin `primaryCommand` on panes/tabs, live availability checks and explicit a11y commands. Source registry acceptance passes; two default Vue cases require watcher-refreshed plugin-kit dist.
- **17 Dialogs:** complete ([receipt](receipts/17.md)). Shared panel action overlay target and keyboard behavior, public scrim token. Native pointer/focus/dark-mode acceptance remains unrun.
- **18 Dependency repair:** complete ([receipt](receipts/18.md)). Restore inputs, run frozen manager repair, verify package absence/original installed version, restore exact inputs again, retain truthful leftovers. Existing fixture executables cover all managers and repeated cancellation. Failure probes reject removed byte restoration and wrong-version acceptance.
- **Orchestrator integrations already applied, verified without redoing:**
  - `jobs/execute.ts` permits bundled official peer suggestions with community off.
  - `catalog/service.ts` evaluates each official release's compatibility from `officialReleases`; `official-history.spec.ts` covers this.
  - `.npmignore` excludes `marketplace-history.json` in nuxt/percy/screenshot/svelte/vue packages.
  - `MarketplaceUpdateDialog` uses the scrim token.
  - Index regenerated after manifest ids changed.
  - Per-spec plugin-kit aliases removed; no alias restored in conformance work.

### 19 — Wave 8 (2026-11-05)

- **Registry config/auth:** complete ([receipt](receipts/19.md)). Supported environment/project/workspace/user npmrc precedence, scoped registry packuments and host/port/path-bound server-only authorization. Search uses default registry. Redirects refused; credentials excluded from replies/cache/errors.
- **Original source regression:** marketplace 242/242, styling guard 4/4; source Node typecheck and auth spec graph passed. Historical default declaration check remained blocked by stale shared dist.
- **Reconciliation:** inventory already uses shared registry client; generic channel error wording retained without DTO changes. No outstanding source integration requested.

### 20–21 — Wave 9 (2026-11-05)

- **20 Generation metadata:** complete ([receipt](receipts/20.md)). Project-owned 200-entry / 32 MiB LRU, original fetch timestamps, read-only memory/disk planning and migration lookup, disposal fence against late publication. Unwritable-disk scenario and isolated failure probes pass. Original source regression 249/249, Node source typecheck passed.
- **21 Real managers:** complete after orchestrator peer validation ([receipt](receipts/21.md#orchestrator-integration)). Actual npm/pnpm use production planner/runner and temporary local registry/tarballs. Six scenarios per manager cover install/load, remove, migration update, peer rollback/advice, invalid-factory repair and authenticated metadata/archive reads.
- **Original blocker superseded:** pnpm exits zero despite conflicting peers. Orchestrator added `jobs/peers.ts` post-install checks; real pnpm now fails correctly and restores inputs/dependencies. Existing fixture tests cover optional/compatible peers and guard failure sensitivity. Current opt-in run below independently confirms both managers pass.
- **Retained boundaries:** native CJS factory cache across same-process reloads (receipt 21 deviation 4); Yarn/Bun unavailable; local endpoint/config assertions do not constitute OS egress monitoring or public-registry acceptance.

### 22 — Wave 10 gap docs and conformance (2026-11-05)

- **Result:** complete with concrete blockers recorded ([receipt](receipts/22.md)). User guide, author guide and API reference updated; README removes fixed gaps and keeps CJS cache, current-only history seeds and lockfile churn review. Slice 14's obsolete blocked status reconciled. Receipts 14–21 preserved.
- **Current checks, source state `527cae3b899baa36915b6e2314b4fd1dbcf0964a` plus uncommitted marketplace work:**
  - Node marketplace: **252 passed / 1 opt-in skip**, 34 passed files / 1 skipped. Styling guard: **4 passed**. Combined **256 passed / 1 skipped** explains the earlier orchestrator aggregate.
  - Real interop opt-in: **13 passed / 12 skipped**; npm **11.13.0** 6/6, pnpm **10.33.2** 6/6, availability assertion passes. Yarn/Bun each skip six named scenarios because offline executable probes fail.
  - Vue marketplace with `NODE_OPTIONS=--no-experimental-webstorage`: **120 passed / 2 failed**, 17 passed files / 1 failed. Both failures are the known pane/tab primary-command cases (`Missing button: Run audit`) awaiting refreshed plugin-kit dist. Refreshed-dist acceptance remains **unrun/blocked**, not green.
  - Additional source acceptance: plugin-kit host registry **22 passed**; shared panel action **3 passed**.
  - Default `tsc --noEmit`: **shared and Vue pass**; **Node and app fail** on stale shared declarations, plus stale plugin-kit `primaryCommand` in app.
  - Node source graph `tsconfig.node.json`: **passes**. App spotlight/spec graph: **five diagnostics**, stale plugin-kit `primaryCommand` plus existing kit `create-host.ts:27`, `registry.ts:54`, `mount-manager.ts:121` and protocol `meta.ts:83` errors.
  - Owned docs/plan/receipt ESLint and whitespace checks recorded in receipt 22. App wording scan found no prohibited wording/filler in marketplace/settings source. No new app copy introduced.
- **Environment evidence:** initial sandbox Node run had local-listener and child-output failures (222 passed / 30 failed / 1 skipped). Permitted rerun passes source suite; sandbox failures are not product regressions. Interop ran permitted with isolated project caches and local registry services.
- **Unrun:** fresh-dist Vue primary-command verification, default Node/app types after watcher refresh, native dialog focus/trap/pointer/dark-mode walkthrough, static/development browser flows, Cypress, docs build, packaged CLI/proxy restart. No build script, dist deletion, source alias workaround, git staging or publication performed.
