# UI legacy cleanup implementation validation

Implementation authorized 2026-10-07 with subagents. Initial checkout: `main`, HEAD `c0c41ffc8e27d00c21eebd0aa0bfeb4adea3ddba`. Working tree already contained unrelated UI/loading-state edits. Original changed files and status were saved to `/tmp/histoire-ui-legacy-cleanup-baseline/` before source deletion. No commit, staging, push, or publication requested.

## Baseline

| Gate | Result | Evidence |
| --- | --- | --- |
| Core client events, runtime frame events, standalone presets | Passed: 3 files / 6 tests | `/tmp/histoire-ui-legacy-baseline-core.log` |
| Native standalone navigation, workbench Search focus, events panel | Passed: 3 files / 14 tests | `/tmp/histoire-ui-legacy-baseline-vue.log` |

Commands used installed Node 24.16.0 and pnpm 10.33.0 through explicit PATH. These focused baselines do not establish a clean full-suite baseline.

## Ownership

- Consumer ledger: source/generated/build/test inventory, no source edits.
- Sandbox URLs: deployment-base helper and URL behavior tests.
- Old view/state: client fallback events, router/views/panels/tree/state deletion and required test migrations.
- Shell/Search: intermediate dialog test migration, old shell/search leaves, current command feedback ownership if regression requires it.
- Primitive cleanup: orphaned toolbar/base/helpers and security/control/icon coverage.
- Styles: obsolete CSS, retained native count rule, architecture/style docs.
- Runtime contracts: generated/import/package checks using fresh output.
- Integration owner: dependency coordination, fresh builds, full suites/typechecks, browser acceptance, final diff review.

## Implemented changes

- Removed 84 inventoried source files and two obsolete stylesheets. Deleted nine exclusive legacy test/harness files; migrated behavior with live consumers to current runtime, SDK, native provider, controls and Search ownership.
- Detached sandbox URL construction from the old router. Root/nested deployment bases, escaped identities and omitted variant use retained shared builder.
- Kept router-free host event fallback with actual caller-owned Pinia, cleaned payload and independent/reset history proof. Retained sandbox runtime publisher and current actor-owned event path.
- Current Search owns command error feedback across pane/query/source/selection/runtime retirement, including same-target bound frame replacement. Current context, prompt answers/defaults, cancellation and direct action tests replace deleted command dialog tests.
- Moved retained portable tree variant-count CSS into native provider tree stylesheet; removed obsolete standalone stylesheet, transitions and pane shadow. Shared controls/runtime/prose/code/fonts remain.
- Retained generated runtime entry paths, explicit embed preset output, runtime grids/renderers/settings, live primitives/helpers, public client exports and compatibility vendor requirements. Final consumer ledger names each boundary.
- Validation exposed stale baseline tests. Repaired actual provider mounting, animation-frame waiting, browser globals, English copy, worker-limit rejection order, selected frame targeting and custom story icon attribution. Preserved useful assertions rather than increasing timeouts/retries.
- Browser proof exposed missing replica shortcut forwarding. CanvasReplicaPreview now subscribes exact mount events through existing SDK API and native provider helpers, guards generation/session ownership, and unsubscribes on retry/unmount. Both-mode adoption recheck passed real iframe Ctrl+K; native Enter prompt submission passed.
- Narrowed canvas header editor snapshot input to fields it reads, fixing a baseline readonly mismatch. This change is erased by TypeScript and does not change runtime behavior.

## Integrated results

Commands below used Node 24.16.0 and pnpm 10.33.0. Fresh root build ran before generated-output and consumer checks. Final Vue/app rebuild follows canvas mount-event forwarding and native internal helper export; erased header-editor narrowing needs no emitted behavior change. Browser migrations change tests only. Concurrent user edits and emitted-output watchers remained active during dev browser checks; their timing limits are recorded separately. No historical redesign result is counted as cleanup acceptance.

| Gate | Current result | Evidence |
| --- | --- | --- |
| `pnpm run build` | Passed, full dependency-aware workspace build | `/tmp/histoire-ui-legacy-build-final.log` |
| Final `@histoire/vue` / `@histoire/app` rebuild | Passed after mount-event forwarding fix | `/tmp/histoire-ui-legacy-vue-build-focus.log`, `/tmp/histoire-ui-legacy-app-build-focus.log` |
| `pnpm run docs:build` | Passed | `/tmp/histoire-ui-legacy-docs.log` |
| Core full suite | 277 files: 276 passed, 1 failed; 1,397 passed / 1 failed | `/tmp/histoire-ui-legacy-tests-core-final.log` |
| Native Vue full suite | Passed after final rebuild: 98 files / 480 tests | `/tmp/histoire-ui-legacy-vue-final-identity.log` |
| SDK full suite | Passed: 27 files / 135 tests | `/tmp/histoire-ui-legacy-tests-sdk.log` |
| Protocol full suite | Passed: 15 files / 58 tests | `/tmp/histoire-ui-legacy-protocol-final.log` (saved tool-output receipt, not redirected stdout) |
| Controls full suite | Passed: 16 files / 58 tests | `/tmp/histoire-ui-legacy-tests-controls.log` |
| Generated runtime/public app graph | Passed: 11 tests, including fresh emitted graph and dynamic imports | `/tmp/histoire-ui-legacy-runtime-contracts-final.log` |
| Packed consumers | Passed: 2 files / 5 tests, including Nuxt package consumer | `/tmp/histoire-ui-legacy-consumers-final.log` |
| App/workbench typechecks | Each has one remaining baseline `responsiveDisabled` error | `/tmp/histoire-ui-legacy-type-app-identity.log`, `/tmp/histoire-ui-legacy-type-workbench-identity.log` |
| Embed typecheck | Passed | `/tmp/histoire-ui-legacy-type-embed-identity.log` |
| Root lint | 12 preexisting errors / 35 warnings in nine unchanged error-bearing files after cleanup ledger fix | `/tmp/histoire-ui-legacy-lint-final.log`; scoped changed-file lint passed |
| React real browser | Passed focused framework case: dev `/book/` screenshot, isolated artifact build/deploy screenshot from unrelated cwd | `/tmp/ui-cleanup-react-browser.log` |
| Nuxt4 real browser | Passed focused static actor/host channel/disposal case | `/tmp/ui-cleanup-nuxt-browser.log` |
| Svelte4 static | Fixture build passed: 8 stories / 33 variants; final browser result recorded below | `/tmp/histoire-ui-legacy-svelte-browser.log` |
| Source inventory / review | 84 source candidates + 2 stylesheets absent; zero retired path consumers; independent review complete | `consumer-ledger.md`, `/tmp/histoire-ledger-final-scan.json` |

Initial vendor build was cancelled when sandbox dependency installation stalled. Typechecks run during that rebuild were invalid and discarded. Final workspace build used approved cache/network access. Default sandbox also denied loopback binding (`EPERM`); browser/fixture gates used approved access. No approval rejection or unresolved environment denial occurred.

### Known baseline failures

1. **List Fit geometry:** `canvas-geometry.spec.ts` expects bottom at most `808.1`; existing result is `808.5480576055338`. Spec and ten relevant canvas/helper imports match initial HEAD exactly and were absent dirty baseline. Assertion and implementation remain unchanged. `/tmp/histoire-ui-legacy-core-baseline.txt` records identity proof.
2. **Responsive metadata type:** `CanvasViewport.vue:116` reads `selectedVariant.responsiveDisabled`, which catalog protocol does not declare and catalog snapshot/projection does not propagate. CanvasViewport, header editor and catalog source matched HEAD before cleanup. This needs a metadata pipeline repair, not a cast masking missing data. Left unchanged.
3. **Root lint:** unchanged SDK session channels/request/selection/services, native controls-panel test, core standalone/workbench navigation tests, node config process and existing devframe inspection plan contain twelve errors. Original root lint had thirteen errors; cleanup ledger double blank was fixed. Existing console warnings remain warnings.
4. **Offscreen Search match reveal:** corrected stale dimming selector reaches existing behavior failure: after panning every match outside mounted viewport, registry lookup cannot reveal unmounted target and displacement stays zero. CanvasViewport and original Cypress spec match HEAD; preserved pan assertion. No production fix added to this cleanup.

### Browser runs and limits

Final focused gates: adoption and documentation routing pass in both dev/history and static/hash (four cases); delayed runtime input passes isolated final recheck (one case). Actual iframe Ctrl+K reaches selected provider Search, native Enter submits command prompt, explicit null selection/docs anchors survive navigation, loading inert actor cannot execute before release, and ready actor click increments state and selects its exact target. Logs: `/tmp/histoire-ui-legacy-embed-browser-final.log` (four passed plus resolved strict-locator harness failure), `/tmp/histoire-ui-legacy-runtime-input-final.log` (one passed, exit 0). Earlier independent providers and custom controls overlays passed four cases; their native embed boundaries were unchanged by standalone replica forwarding. Nine distinct embed browser cases passed across recorded runs.

Final rebuilt Vue static fixture passed (42 stories / 1,095 variants, `/tmp/histoire-ui-legacy-vue-static-build-final.log`). Affected workbench recheck: 13 cases / 12 passed / 1 failed, retries=0 (`/tmp/histoire-ui-legacy-vue-static-workbench-identity.log`). Remaining case reaches Search and reports No matches for Props query `message`; exact real iframe Ctrl+K separately passes both-mode final adoption. Across distinct static cases, 62/64 pass across recorded runs; remaining failures are Props search and offscreen match pan. Earlier unaffected source/controls/state/visual evidence and fresh final focused keyboard/package proofs have separate source boundaries. Initial static Vue twelve-spec run: 64 tests, 49 passed / 3 failed / 12 skipped. Failures were broad offline icon guard, retired dimming wrapper and stale checkbox label assertion. Guard now admits only exact user-authored fixture icons absent offline built-in set; fonts and built-in icon requests remain forbidden. Accessible checkbox test now proves actual selected button disables and resets. Dimming migration preserves existing pan failure above.

Initial embed run: five files / nine tests, four passed / five failed. Actual provider-isolation and controls-overlay cases passed; three standalone suites used obsolete selected iframe/primary wrapper selectors. Migrated recheck targets actual selected ready actor and native Enter prompt submission.

Vue static visuals captured and inspected: `/tmp/histoire-ui-legacy-visuals/wide-light.png`, `wide-dark.png`, `wide-search.png`, `narrow-stories.png`. Actual Demo route at 1440×1000 and 390×844; native workbench counts, canvas, props and Search render. Mobile document width is 390; zero page errors. No cleanup visual defect or visible first-party “preview” copy found. These screenshots do not prove portable HistoireStoryTree CSS or prompt submission. Evidence and limits: `/tmp/histoire-ui-legacy-visuals/evidence.json`, `review.md`.

### Detailed dev diagnostics

Initial Vue dev eleven-spec run: 60 tests / 48 passed / 11 failed / 1 skipped (`/tmp/histoire-ui-legacy-vue-dev-browser.log`). Seven-spec bounded diagnostic recheck: 45 tests / 38 passed / 7 failed / 0 skipped (`/tmp/histoire-ui-legacy-vue-dev-browser-final.log`). These runs observed broad emitted app module reloads from concurrent workspace activity; they are not frozen final-build acceptance. Actual events 3/3, state-grid 6/6 and codegen 11/11 passed diagnostic recheck; docs/generated/raw source case passed after reusing canonical readiness and source-content helper.

Remaining dev diagnostics: two screenshot cases returned `{ "code": "unavailable", "message": "Server execution is unavailable" }` or lost dialog during module reload; Search Props query `message` showed No matches; offscreen match pan displacement stayed zero; Tests Watch footer was clipped; two Vitest Mocking tests attempted an absent virtualized tree row. Screenshot/server capability, prop search and test-pane/tree problems are unresolved current-checkout/browser limits, not proven cleanup regressions or clean baseline reproductions. Source/data requests and real framework screenshots have separate passing evidence; they do not establish toolbar screenshot service acceptance.

Svelte4 distinct existing checks: render 5 + state 1 passed first run; final tightened workbench 6/6 passed with retries=0. Custom icon allowlist is exact (only `carbon:car` in Svelte; Vue allowed glyphs are fixture-authored names absent current offline Carbon set), without registry-driven bypass. Four temporary visual probes passed; light/dark 900px screenshots inspected with actual selected BaseButton and custom controls. Electron physical screen cropped wide 1600px captures; no full wide Svelte visual claim. Svelte evidence: `/tmp/histoire-ui-legacy-svelte-captures/histoire-ui-legacy-svelte-captures.cy.js/svelte-light-900.png`, `svelte-dark-900.png`. Owned Svelte server19108 stopped.

## Review and delivery boundary

Source cleanup is implemented. Concurrent work continued after final gate window, including additional replica selection lifetime changes, visibility/menu helpers and tests; preserved in place. Reported builds/tests prove their recorded source window, not every later concurrent edit. Final scoped lint noticed a same-file one-line try block from that work; formatting expanded it without changing behavior. Full integrated acceptance is not claimed while listed baseline/source/browser gates remain unresolved. No staged changes, commits, pushes, tags, publication, CI, deployment or credentialed agent campaign. Final deletion count: 95 files (84 source, 2 stylesheets, 9 exclusive tests/harnesses); final HEAD unchanged. Final status saved to `/tmp/histoire-ui-legacy-final-status.txt`. Owned Vue dev19106, Vue static19107 and Svelte static19108 servers and browser contexts stopped after acceptance; concurrent user work and processes remain intact. Source inventory and `git diff --check` passed final review. Independent review found no unresolved cleanup implementation defect; known baseline gates and unresolved browser behavior prevent full acceptance claim.
