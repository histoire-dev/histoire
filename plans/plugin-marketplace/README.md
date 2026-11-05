# Plugin marketplace slice plans

Status: **complete — source implementation and documentation, slices 01–22** (2026-11-05), with concrete conformance blockers recorded. Baseline/HEAD `527cae3b`; work remains uncommitted. Latest checks: Node marketplace **252 passed / 1 opt-in skip**, styling guard **4 passed** (combined **256 passed / 1 skipped**), real npm/pnpm interop **13 passed / 12 skipped** (Yarn/Bun unavailable). App marketplace **120 passed / 2 blocked by stale plugin-kit dist**. Default Node/app typechecks need refreshed shared/plugin-kit declarations; browser, Cypress and docs build remain unrun. See [latest receipt](receipts/22.md), [initial conformance receipt](receipts/13.md) and [evidence ledger](evidence.md). No publication or CI result claimed.

## Goal

Let users find, install, configure, update, and remove Histoire plugins from the workbench, following the approved mockups (design canvas `BgY8xTQ9EXKabvpnv459WN`, version 29):

- **1 · Settings › Plugins** (board `Main`): installed list with versions, update chips, Required chip, enable switches, "Browse marketplace", marketplace preferences.
- **2A · All plugins** grid with category nav and counts; **2B · Discover** with a project-aware hero and curated rows.
- **3A · Facets** (category, framework, publisher, adds) with match highlighting; **3C · No results** with recovery actions.
- **4A · Plugin detail** page with tabs Overview / Options / Changelog / Versions and a metadata column.
- **5A · Options** with live `histoire.config.ts` diff; **5B · Review** of command and file changes; **5C · Manual install** when the workbench can't edit files.
- **6A · Progress** with step list and output; **6C · Failure** with log and suggested fallback version.
- **7A · Spotlight** of new contributions after install; **7B · Manage** menu (Options, Changelog, Pin version, Remove); **7C · Update** with release notes and config migration.

Everything opens inside one fullscreen modal over the workbench (12px inset, header with Discover / All plugins, search, Esc close). Rejected mockup variants (1A rail pane, 1C home recommendations, 2C side pane, 3B compatibility view, 4B drawer, 4C contributes view, 6B background status pill) are out of scope.

This pack supersedes the "No marketplace, runtime installer" default in [workbench-plugins](../workbench-plugins/README.md#confirmed-defaults) for this milestone only. Plugins remain trusted code; the marketplace never loads remote UI or executes package code before the user installs it.

## Read first

1. [Architecture and current seams](architecture.md).
2. [Locked contracts](contracts.md).
3. [Validation and acceptance](validation.md).
4. [Evidence ledger](evidence.md).

## Locked decisions

- **Catalog sources.** Official entries ship with Histoire as a bundled index generated from `histoire.marketplace` fields in official package manifests. Community entries come from the npm registry (`keywords:histoire-plugin`), fetched by the dev server only, and only when the "Community plugins" preference is on (default off). The browser never calls the registry.
- **Official** means listed in the bundled index *and* published under `@histoire/`. The registry cannot make a package official.
- **Install only in dev.** Static builds show the bundled official catalog and always use the manual flow (5C). The dev server also falls back to manual when it can't edit the config safely or can't find a package manager.
- **Declarative manifests.** Options forms, config snippets, contributions ("adds"), declared access, recommendations, release notes and migrations are plain JSON in `package.json#histoire.marketplace`. Histoire never runs package code to render the marketplace or to migrate a config.
- **One job at a time per project**, owned by the dev server, guarded by the existing config hash, temporary-load check, backup and restore flow from plugin toggles. Package manager commands run as argv with no shell.
- **Install order:** resolve, then package manager install, then config write, then restart, then a plugin-loaded check. A failure before the config write restores `package.json` and the lockfile bytes ("No project files were changed"). `node_modules` changes that can't be reverted are reported, never hidden.
- **Preferences** (community plugins, package manager override, after install restart/ask, skipped versions) live in the existing UI settings store and travel with each request. They are not saved to the project.
- **The modal is state-driven** (like `EmbedDialog`), mounted once in `WorkbenchApp`, and returns focus to whatever opened it. It is not a route.
- **Provenance:** show "Published with npm provenance" only when the registry packument carries an attestation. Never claim it was verified. (The mockup text "provenance verified" is replaced.)

## Ordered slices and waves

Each slice starts **planned**. Waves run one after another; slices in the same wave run in parallel **only** because their owned files don't overlap (see [file ownership](#file-ownership)). Dependencies list technical prerequisites.

- **Wave 1**
  1. [01 — Contracts, manifests, and scaffolding](01-contracts-and-scaffolding.md). No dependency.
- **Wave 2**
  2. [02 — Catalog service](02-catalog-service.md). Requires 01.
  3. [03 — Installed inventory](03-installed-inventory.md). Requires 01.
  4. [04 — Change planner](04-change-planner.md). Requires 01.
  5. [05 — Marketplace shell](05-marketplace-shell.md). Requires 01.
- **Wave 3**
  6. [06 — Install jobs](06-install-jobs.md). Requires 01, 03, 04.
  7. [07 — Browse and discover](07-browse-and-discover.md). Requires 01, 02, 05.
  8. [08 — Plugin detail](08-plugin-detail.md). Requires 01, 02, 05.
- **Wave 4**
  9. [09 — Install wizard](09-install-wizard.md). Requires 04, 05, 06, 08.
  10. [10 — Settings management](10-settings-management.md). Requires 03, 05, 06.
- **Wave 5**
  11. [11 — Post-install spotlight](11-post-install-spotlight.md). Requires 06, 09.
  12. [12 — Updates and migrations](12-updates-and-migrations.md). Requires 04, 06, 10.
- **Wave 6**
  13. [13 — Docs and conformance](13-docs-and-conformance.md). Requires 01–12.

## Gap-fix slices and waves (14–22)

These slices close the functional gaps listed in [follow-ups](#follow-ups-and-proof-gaps). Same rules as above: parallel only with disjoint owned files, receipts in `receipts/<NN>.md`.

- **Orchestrator pre-steps before wave 7**
  - Add `semver` and `@types/semver` to `packages/histoire` (slice 14).
  - Shared type: `Add.contribution?: string` in `histoire-shared/src/types/marketplace.ts` (slice 16).
- **Wave 7**
  14. [14 — npm semver](14-npm-semver.md).
  15. [15 — Official release history](15-official-release-history.md).
  16. [16 — Contribution ids and primary commands](16-contribution-ids-and-primary-commands.md).
  17. [17 — Dialog overlay target and scrim token](17-dialog-overlay-and-scrim.md).
  18. [18 — Dependency repair after failed jobs](18-dependency-repair.md).
  - After the wave, the orchestrator regenerates `official.json` (16 edits manifests, 15 owns the generator).
- **Wave 8**
  19. [19 — Registry config and authentication](19-registry-config-and-auth.md). Requires 14–18.
- **Wave 9**
  20. [20 — Generation catalog metadata](20-generation-catalog-metadata.md). Requires 19.
  21. [21 — Package manager interoperability harness](21-package-manager-interop.md). Requires 18, 19.
- **Wave 10**
  22. [22 — Gap docs and conformance](22-gap-docs-and-conformance.md). Requires 14–21.
- **Wave 11**
  23. [23 — Host process restart](23-host-process-restart.md). Requires 06, 09, 10, 12, 18.
- **Wave 12 — visual polish** (browser review against the boards, parallel by disjoint files)
  24. [24 — Shell and browse](24-polish-browse.md).
  25. [25 — Plugin detail](25-polish-detail.md).
  26. [26 — Install wizard](26-polish-install.md).
  27. [27 — Settings, manage, update, spotlight](27-polish-settings.md).
- **Wave 13**
  28. [28 — Official plugin logos](28-official-logos.md).
- **Cleanup** (four-angle review of `f5798ef7..bae8feb0`)
  - Wave A, parallel: [29 — Shared catalog and command logic](29-cleanup-shared-logic.md), [30 — Node catalog, registry, inventory](30-cleanup-node-registry.md), [31 — Node jobs, migrations, channel](31-cleanup-node-jobs.md), [32 — App marketplace state](32-cleanup-app-state.md).
  - Wave B: [33 — App UI components](33-cleanup-app-ui.md).
  - Wave C: [34 — Test infrastructure](34-cleanup-tests.md).
  - Deliberately skipped (behavior or design changes, recorded for later): one `BaseDialog` for native dialogs; routing plugin-toggle config reloads through the host process restart; tint colors as theme tokens; a dedicated logo-kind field instead of the data-URI check; builtin tile metadata declared by plugins server-side; one inventory row builder without the `'local'` version sentinel; a unified error class across planner/jobs/catalog; per-kind command-relation table in plugin-kit; lazy server-side marketplace imports; pre-serialized channel replies; a11y command independent of tab mount timing.

Deliberately not planned:

- **Runtime-computed config imports:** config inspection fails closed to the manual flow; static analysis can't prove arbitrary runtime resolution safe.
- **Arbitrarily large catalogs:** request and reply bounds stay explicit and fail visibly.

## File ownership

Slice 01 creates every shared contract, registry, client wrapper and stub module, so later slices fill files they own instead of editing shared ones.

- **Only 01 edits** `histoire-shared/src/types/{marketplace,ui-marketplace}.ts`, `histoire-shared/src/types/index.ts`, `NODE/marketplace/channel.ts`, `NODE/server/ui-channel/index.ts`, `APP/util/marketplace-client.ts`, and the official plugin `package.json` files.
- **Only 05 edits** `APP/stores/marketplace.ts`, `APP/components/shell/WorkbenchApp.vue`, and `APP/components/marketplace/shell/**`. It creates the view stubs that 07, 08, 09, 11 and 12 replace.
- **Only 10 edits** `APP/components/pages/settings/PluginsSection.vue`, `usePluginToggles.ts` and the rail badge wiring.
- Every other slice owns the directories listed in its plan.

When a slice needs a change to a file it doesn't own, it records the change in its receipt as a deviation and leaves the file alone. The orchestrator applies those changes between waves, one at a time.

`APP` = `packages/histoire-app/src/app`, `NODE` = `packages/histoire/src/node`.

## Receipt reconciliation

Historical receipts remain unchanged; later Integration sections and the reconciliation below supersede their initial blocked states. Slice 13 records waves 1–6; slice 22 records waves 7–10 and current proof boundaries. All slice statuses are complete at source scope.

- **02 Catalog:** named rich `officialPlugins` export, bounded replies/version lists and index-authoritative official identity retained. Obsolete channel assertions already fixed between waves. Slice 14 replaces the internal evaluator with npm semver. Detail freshness remains absent from the DTO; catalog source notices remain authoritative.
- **03 Inventory:** local registry adapter and conservative source mapping retained; existing parser import map supplies aliases. Stable-to-prerelease exclusion and bundled-only updates without consent remain deliberate. `pinned` stays in installed settings inventory; no catalog consumer needs an extra flag. Earlier range/scaffold failures were fixed by their owners and final suites pass.
- **04 Planner:** stronger hashes, conservative manual reasons and estimated package-manager diffs retained. Migration hook landed in 12. Slice 13 adds package-input graph refusal and pin downgrade warnings. Slice 20 supplies generation-owned read-only metadata when disk persistence fails.
- **05 Shell:** shared settings type, virtual alias and debounce integration already landed. Slice 13 fixes generic Settings reset for marketplace preferences using shared defaults and the existing reactive identity. Marketplace-owned hydration remains intentional; scrim matches EmbedDialog. Validation commands now use actual package names `@histoire/app` and `@histoire/vue`.
- **06 Jobs:** initial lease/IPC and browser-ack blockers superseded by watcher restart model, `job-continue`, server load evidence and live browser spotlight. Config-file resolution and receipt TTL sweep already fixed. Slice 13 shares package-input graph guard with planner. Private receipts stay in `.histoire/marketplace` to survive package-manager changes; latest pointer can outlive expired receipt. Unknown process death stays conservative; no unsafe restore under possible live writers. Slice 15 integration enables bundled official peer advice with community off.
- **07 Browse:** debounce and full collection query/pagination wired between waves. Retained Discover suggestions remain bounded to real received collections; no fabricated groups.
- **08 Detail:** typed not-found and per-version reasons integrated. Slice 17 replaces the local native-dialog split with shared `WorkbenchPanelAction` overlay-target support. Existing spec-graph diagnostics remain separate from source checks.
- **09 Wizard / 10 Settings:** continuation wrapper, store-owned admission/restart/session recovery, exact detail tabs, nav count and retained destination already integrated. Manager detection only appears after a successful real plan; no detection claim in static books. Spec-graph and refreshed-dist checks remain outstanding.
- **11 Spotlight:** live registry identity and explicit toolbar commands retained. Slice 13 adds the missing popover anchor and tests actual action/popover/custom components; custom views expose the shared ExtensionView anchor. Slice 16 adds exact manifest contribution ids and same-plugin pane/tab primary commands. Storage denial and metadata deadline keep conservative fallback behavior.
- **12 Updates:** slice 13 centralizes update-detail events in shared types, adds `updateDetail()` to shared client, removes local declaration merging/transport adapter, and warns on lower-version pins. Migration adapter retains base plan capability/expiry guards; direct raw planner consumers intentionally do not gain migration execution. Slice 15 adds bounded bundled release snapshots.

### Waves 7–10 reconciliation

- **14 npm semver:** direct `semver` adapter replaces the internal parser; prerelease admission follows npm comparator-set rules. Earlier concurrent slice/type failures are superseded by the current Node source suite and source-graph typecheck. Dependency lockfile churn still needs review.
- **15 Official history:** version-scoped committed snapshots feed offline update selection, migrations and compatible peer advice. Orchestrator already applied all requested integrations: `execute.ts` admits official ids with community off; catalog detail checks each `officialReleases(id)` entry's compatibility; package-local `.npmignore` excludes history for nuxt/percy/screenshot/svelte/vue. Current generated index passes drift checks. Optional snapshot CLI root supports isolated tests; no protocol change. Seeds contain current versions only.
- **16 Contribution relationships:** `adds[].contribution` matches local ids; `primaryCommand` is qualified and restricted to the same plugin on panes/tabs. A11y needed new `run-audit` / `run-all` commands because none existed. Regeneration after manifest changes already landed in 15. Orchestrator removed per-spec plugin-kit alias configs; do not restore them. Two default Vue primary-command cases remain blocked until existing watchers refresh plugin-kit dist. Source host-registry acceptance passes.
- **17 Dialog integration:** shared action accepts an overlay target and preserves keyboard behavior. Public scrim token covers marketplace, embed and update dialogs; orchestrator already fixed the update-dialog call site. Native focus/pointer/dark-mode proof remains unrun.
- **18 Recovery:** frozen manager repair follows safe input restoration, verifies requested package absence/original installed version, and restores saved bytes again. Repair evidence extends the receipt locally; Yarn probing uses the existing cancellable runner. No shared contract change needed. Unknown live writers and successor-load failures remain conservative.
- **19 Registry configuration:** env/project/workspace/user npmrc precedence, scoped packument routing and host/path-bound auth share the existing client. Inventory already delegated to that client, so no duplicate endpoint edit was needed. Channel errors keep existing generic wording; fixture tests establish credential exclusion without a new DTO field.
- **20 Generation metadata:** project-scoped LRU retains up to 200 entries / 32 MiB and fences late publications on channel disposal. Planner and migration reads use memory then disk without writes/network, retaining original freshness times. Existing disk-revision test clears generation memory deliberately. Concurrent interop exclusion in the original receipt is superseded by the current default suite and opt-in run.
- **21 Interop:** opt-in harness uses actual available managers, local registry/tarballs and isolated caches. Orchestrator already added post-install non-optional peer checks in `jobs/peers.ts`; pnpm's zero exit on peer conflicts now produces failure, rollback and compatible advice. npm and pnpm pass all six scenarios each. Invalid-factory install separately proves real repair. Yarn/Bun unavailable; sandbox child-process limitations require permitted runs. Native CJS cache reuse remains an explicit follow-up.
- **22 Docs/conformance:** user/author/API docs updated; statuses and waves 7–10 ledger reconciled; validation commands rerun. Documentation-only changes add no source/tests or aliases. See [receipt 22](receipts/22.md) for exact checks, blockers and unrun commands.

## Follow-ups and proof gaps

- Plugin changes now replace the runtime process through the dev proxy ([slice 23](23-host-process-restart.md)). In-process SDK/MCP runtimes still reload in the same process (package-only changes there need a manual restart), and the in-process interop harness can't prove replacement CJS factory execution.
- Official history supports up to 50 snapshots per package, but seeded files currently contain only current versions. Recover real older release metadata if full intervening offline history is required; never fabricate it. Consent-off continues making zero registry requests.
- Review `pnpm-lock.yaml` churn from adding direct `semver` / `@types/semver` dependencies before publishing these changes. This docs slice neither rewrites the lockfile nor certifies unrelated resolution changes.
- Generation memory is bounded and expires on disposal. An unwritable disk cache plus eviction/restart may require reopening detail before planning. Planning itself remains read-only and makes no network requests.
- Exact installed-version descriptive metadata remains an optional API extension; contribution identity is taken from the live registry and ambiguous kind-only descriptions stay suppressed.
- Config input inspection covers loader-known Histoire/Vite modules and literal local import/export/require/dynamic-import edges, including native modules absent from jiti's cache. Arbitrary runtime-computed module resolution remains a loader/static-analysis boundary. Bounded or unparseable local graphs fail closed to manual flow.
- Real npm/pnpm interoperability is proven against fixture registry services, not public npm/private production registries. Yarn/Bun commands have fixture coverage but their real executables were unavailable. Arbitrary oversized catalogs remain unsupported; bounded replies fail explicitly, and package-manager output/`node_modules` leftovers stay visible.
- Refresh shared and plugin-kit declarations through existing watchers, then rerun default Node/app `tsc` and the two blocked Vue spotlight primary-command cases. Source Node `tsc` passes; spec-inclusive app graph still has existing plugin-kit/protocol diagnostics. No compiler weakening, alias restoration or dist rebuild performed here.
- Lint owned docs/plan paths independently. Historical `contracts.md` illustrative JSONC/compact TypeScript errors remain outside this slice; no lint rules disabled or broad example reformat applied.
- Orchestrator must run native dialog focus/trap, dark-mode/mockup walkthrough, reload/proxy restart, static/development browser checks, Cypress and docs build. New `marketplace.cy.js` covers browse/detail/focus and static manual instructions; dev package installation requires isolated fixture registry/executable wiring before enabling such an E2E. No workbench dev server or build started here; Node acceptance uses temporary fixture servers.

## Working and completion rules

- Preserve unrelated dirty, staged and untracked changes. Recheck `git status --short` and reread shared files before each slice. Do not reset, clean, revert, stage, unstage, commit or push.
- Never run a package `build` script (it runs `rimraf dist` and breaks the user's watchers and dev server). Use `tsc --noEmit`, ESLint and Vitest on source. Process specs that need a fresh `dist` are recorded as unrun.
- New source modules stay under 300 lines; documentation is exempt. Add JSDoc to every introduced function, class, type and property, and comment non-obvious lifecycle or ordering logic.
- App code uses Tailwind `htw:` utilities only. Use `WorkbenchEmptyState` / `WorkbenchLoadingState` / `WorkbenchErrorState` for panel states and `HstPulsatingDisc` for busy indicators; never pair a progress bar with a disc. No colored side stripes. No visible "preview" wording. No filler copy.
- Write useful failing tests first where practical: real algorithms, the real codemod, and real child processes against fixture package managers. Don't test classes or styles. Don't mock the module under test. Reuse existing fixtures and helpers before adding new ones.
- Write a receipt to `receipts/<NN>.md` for each completed slice using the fields in [validation](validation.md#receipt); the orchestrator merges receipts into [evidence.md](evidence.md) between waves, so parallel slices never edit one file. Mark a slice complete only after its acceptance gate is demonstrated.
