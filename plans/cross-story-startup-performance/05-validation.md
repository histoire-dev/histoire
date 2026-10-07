# Slice 0/5: baseline and integrated validation

## Baseline gate

Capture before production edits/package builds. Preserve existing dirty sources and previous task changes. Own benchmark/Cypress/results files in this folder and one focused cross-story Cypress spec. Reuse or extend existing benchmark utilities rather than copy full fixtures blindly. Task-owned servers only; no existing watcher termination. Prefer installed Node 24 and pnpm explicit PATH. Local browser/server tools may need approved elevated execution.

## Matched experiment

Fixture: Vue3 example Codegen and BaseButton, same Grid/List arrangement and viewport/live-frame budget for both runs. Reproduce trace's multi-frame workload (3/11 document targets) if possible; record actual arrangement and admissions, do not assume `grid=false` URL means Single. Use real story-tree clicks, 5 warmups then 30 alternating selections. Capture dev and frozen static baseline. Dev cache state and dependency optimizer stability must be explicit. Run ordinary warmed browser cache conditions; if reproducing uncached trace separately, label it and compare like with like. Keep browser version/viewport/build identity and ready criteria in JSON.

Measure click initiation to first relevant/selected host-ready frame including retained-state restoration; also all expected admitted frames ready and post-click main-thread long-task burden. Never infer ready from DOMContentLoaded. Record new sandbox documents, peak concurrent pending starts if observable, total live documents, script requests/unique URLs/bytes, CodeMirror/control dependencies. Avoid injecting profiling overhead into timing runs; structural and trace probes separate. No CI millisecond thresholds. Before/after use identical runner and network settings.

If total readiness under bounded starts regresses repeatably, inform parent before final acceptance so concurrency can be tuned or slice revised. Zero cross-story document navigation is not an acceptance criterion; correct fresh isolation is required.

## Browser regressions

Verify selected-frame host readiness precedes sibling sandbox document requests on initial story activation, and remaining admitted frames start in increasing geometric distance order with bounded concurrency. Repeat after selected Retry and rapid navigation; no obsolete queued documents. Structural instrumentation runs separately from timing samples.

Cross-story A/B/A; selected and visible frames become usable; captured old document/session never owns inspector or requests after switch; per-variant state restored. Rapid story changes leave no obsolete queued documents; failed frame/Retry does not block others. Controls editing, custom slots, JSON editor on demand, dynamic source, ordinary/Vitest-mocked stories; existing Single/Tailwind regressions. Grid/List zoom/pan and Matrix isolation have focused lifecycle coverage. Dev and static.

## Integrated checks

Relevant SDK descriptor/session suites, generated runtime/readiness/mocking tests, controls and Vue lifecycle/ownership tests, frame admission/Matrix tests; changed-file lint, relevant typechecks, controls/SDK/Vue/backend/app and static example builds. Record existing `CanvasViewport.vue responsiveDisabled` type error separately if unchanged. Parent reviews security boundaries, scheduler permit lifetime/reentrancy, lazy controls refs, focus and cleanup. Persist raw selected before/after samples under results/, plus commands/results here. Do not store huge raw Chrome trace or generated dist in Git.

## Results

### Before-change baseline

Captured before production changes or package builds. Both runs used Node `v24.16.0`, Chromium `147.0.7727.15`, Linux `7.2.8-200.fc44.x86_64`, a `1920x1400` viewport, Grid, real story-tree clicks, 5 unreported warmup selections, then 30 alternating timed selections (15 per story). Each timed activation admitted and readied all expected variants: 3 for BaseButton and 11 for Code gen. Every selection had a selected-frame host-ready time and an all-admitted-frames-ready time. Page errors: zero in both runs.

| Mode | Story | Selected host-ready median / p95 (ms) | All admitted ready median / p95 (ms) | Long-task duration to all ready median / p95 (ms) |
| --- | --- | ---: | ---: | ---: |
| Dev | BaseButton, 3 variants | 760 / 1,216 | 760 / 1,216 | 150 / 199 |
| Dev | Code gen, 11 variants | 2,964 / 3,568 | 2,996 / 3,601 | 238 / 415 |
| Static | BaseButton, 3 variants | 305 / 387 | 305 / 387 | 115 / 151 |
| Static | Code gen, 11 variants | 731 / 901 | 774 / 952 | 190 / 285 |

Input delay is `null` in the result files because the browser run did not expose matching Event Timing entries; this is unavailable data, not zero delay. The static runner used a fresh browser context with Chromium cache enabled. During timed switches it recorded 0 script response-body bytes because asset responses were satisfied from that warmed browser cache; this is distinct from request counts.

| Mode | Script requests | Unique script URLs | Script response-body bytes | Canvas sandbox documents |
| --- | ---: | ---: | ---: | ---: |
| Dev | 83,327 | 823 | 1,497,238,420 | 274 |
| Static | 5,676 | 25 | 4,633,241 | 252 |

Counts span startup, 5 warmups, and 30 timed switches. The baseline dev run recorded 274 canvas sandbox documents total, including 33 during startup; the baseline static run recorded 252 total, including 11 during startup. Each timed target switch created 11 Code gen or 3 BaseButton documents. Dev startup created 33 sandbox documents because Vite optimized dependencies and reloaded during startup; timed switches then consistently created 11 or 3. The dev run also observed `msw`, `change-case`, `vue`, and `pinia` dependency optimization. Those startup events are recorded in the raw result, not treated as part of any click timing. The browser's sandbox URLs carry `grid=false`; the visible workbench was Grid and admitted the expected 11/3 frames, as verified from host DOM and ready state. The fixture includes selected variant `html` and visible controls/inspector, so its shell and controls requests differ from the original story-only trace. The generic no-ETag static server run was diagnostic only and is not included here.

The static run used the existing frozen Vue 3 example artifact through Histoire's own `histoire preview` server at `http://[::1]:6085`, not the dev server. Build metadata: built at `2026-10-07T13:39:24.032Z`, commit `c0c41ffc8e27d00c21eebd0aa0bfeb4adea3ddba`, build ID `0b52569619d7f179cf1d240d60b363c38f9d827c49f0640abe0210a591f6cada`, index HTML SHA-256 `37c8a8137440e9c0dca4d107e05219e55bbdc03fbf88895e890e78fe081cae1a`. Frozen tree SHA-256: `4e9e02c409306c787d56d77df9e3c157a2a28d7bfd7276efcfa70553201d345f`. Dev ran at `http://127.0.0.1:6008`; index HTML SHA-256 `440d51b7eb88f241df26e6d59361b2350364932973d140b8078ca72c28f318ba`. Ports 6006 and 6007 were already occupied and were not disturbed. The captured baseline predates implementation edits; dev source changes since then are intentionally outside this baseline.

Reproduction commands for the captured browser runs (servers must already be listening on the recorded URLs):

```sh
/home/akryum/.local/share/mise/installs/node/24.16.0/bin/node plans/cross-story-startup-performance/cross-story-switch-benchmark.cjs dev http://127.0.0.1:6008 plans/cross-story-startup-performance/results/before-dev.json
/home/akryum/.local/share/mise/installs/node/24.16.0/bin/node plans/cross-story-startup-performance/cross-story-switch-benchmark.cjs static 'http://[::1]:6085' plans/cross-story-startup-performance/results/before-static.json
```

Machine-readable per-selection timings, readiness evidence, compact network summaries, and build identity are in [`before-dev.json`](results/before-dev.json) and [`before-static.json`](results/before-static.json). The baseline gate was released after both captures; final app/static builds and after-change runs are recorded below.

### Browser regressions and integrated checks

Final app and static builds are complete. Focused structural Cypress runs are green on both final dev and static servers. Matched timing runs completed in fresh browser contexts; unrelated CPU load varied across captures, so report all-ready comparisons with that limitation.

#### Structural Cypress (2026-10-07)

Ran Cypress 13.17.0 with Electron 118 and Node `v24.16.0` against final dev `http://127.0.0.1:6090` and static `http://localhost:6092`. Each browser run used `retries=0`. The selected-first test delayed the selected Code gen `html` sandbox response and verified no sibling sandbox request began before host readiness, siblings followed geometric nearest-first order with stable DOM-order ties, and no more than two sibling runtimes remained pending readiness.

| Mode | Cross-story admission and A/B/A | Single variant | Tailwind switching |
| --- | ---: | ---: | ---: |
| Dev | 2/2 | 2/2 | 3/3 |
| Static | 2/2 | 2/2 | 3/3 |

The A/B/A test also checks fresh Code gen/BaseButton documents across story changes, restored BaseButton control state, the Code gen JSON editor, and generated source. The first test version assumed a story-row click selected Code gen `html`; browser evidence showed the story-only URL leaves variant selection empty, so the admission proof now opens the story with explicit `variantId=html`. Existing tree navigation and canvas-variant selection remain in the A/B/A regression.

#### Other browser smoke

[`01-sandbox-smoke-results.md`](01-sandbox-smoke-results.md) records exact commands. Dev Cypress codegen and controls passed 11/11 and 5/5; static codegen and controls passed 11/11 and 5/5. Direct-route Playwright probes passed Vitest mocked story/control editing, JSON editor/model update, and generated/story-file source modes on dev and static, with no page errors. The existing dev `vitest-story.cy.js` helper failed before navigation because it could not find the virtualized/offscreen Vitest row; direct-route Vitest proof passed. Do not treat that selector failure as a runtime regression.

### Matched timing and network

Post-change runs used the same Node `v24.16.0`, Chromium `147.0.7727.15`, Linux `7.2.8-200.fc44.x86_64`, `1920x1400` Grid fixture, cache settings, 5 warmups, and 30 timed selections as the baseline. Each invocation launched a fresh Playwright browser context. Dev used the final source server at `http://127.0.0.1:6090` (entry HTML SHA-256 matched baseline `440d51b7eb88f241df26e6d59361b2350364932973d140b8078ca72c28f318ba`). Static used final build `be2deb5e7ab8ec8b255b00012185a64f0689cc8411181acda3e60ca2977ba762`, built at `2026-10-07T16:36:19.808Z` from commit `c0c41ffc8e27d00c21eebd0aa0bfeb4adea3ddba`; final index HTML SHA-256 `8086148d44af409445e593a968ee3da45bdba488d47d27247918d43a06eea94e`. All post-change runs completed with the expected 3/11 frames and no page errors. Input delay remained unavailable (`null`).

| Mode / run | Story | Selected host-ready median / p95 (ms) | All admitted ready median / p95 (ms) | Long-task duration median / p95 (ms) |
| --- | --- | ---: | ---: | ---: |
| Dev first after | BaseButton | 335 / 498 | 868 / 1,250 | 105 / 170 |
| Dev first after | Code gen | 402 / 2,077 | 2,032 / 5,914 | 118 / 438 |
| Dev repeat | BaseButton | 319 / 561 | 733 / 976 | 100 / 168 |
| Dev repeat | Code gen | 358 / 738 | 1,866 / 2,657 | 106 / 198 |
| Static first after | BaseButton | 259 / 335 | 466 / 617 | 98 / 111 |
| Static first after | Code gen | 267 / 375 | 1,100 / 1,433 | 99 / 155 |
| Static repeat | BaseButton | 263 / 358 | 466 / 634 | 100 / 133 |
| Static repeat | Code gen | 260 / 351 | 1,099 / 1,298 | 100 / 127 |
| Paired old static under current load | BaseButton | 1,033 / 2,977 | 1,033 / 3,276 | 422 / 1,534 |
| Paired old static under current load | Code gen | 2,433 / 5,487 | 2,481 / 7,666 | 640 / 4,394 |

The first dev after-run's `timed-23` Code gen sample remains in the data: selected-ready 2,077 ms, all-ready 5,914 ms, and 438 ms of long tasks. It is not excluded. The fresh dev repeat's Code gen all-ready p95 was 2,657 ms, below the 3,601 ms baseline, while its selected-ready p95 was 738 ms versus 3,568 ms baseline.

Both final static samples improve selected readiness against baseline (BaseButton p95 387 to 335/358 ms; Code gen 901 to 375/351 ms). Both also show higher all-admitted medians and p95 (BaseButton 305/387 to 466/617–634 ms; Code gen 774/952 to 1,099–1,100/1,298–1,433 ms). This selected-first versus total-completion cost is repeatable in the two final samples, but attribution is not clean: process snapshots around captures showed unrelated Rust compilation, TypeScript, ESLint, Vitest, package watchers, and another project's browser worker consuming substantial CPU. A fresh-context repeat against the exact frozen old static artifact under that active load was much slower still (Code gen all-ready p95 7,666 ms). Preserve the observed cost; do not treat these loaded runs as a controlled causal comparison or retune the selected-first gate from them.

Static network totals span startup, 5 warmups, and 30 timed switches. Canvas sandbox document count and bytes were identical. Total script response bytes fell by about 11.6%, while request count and distinct script URLs rose because chunking and per-frame script requests changed.

| Static build | Script requests | Unique script URLs | Script response-body bytes | Canvas sandbox documents / bytes |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 5,676 | 25 | 4,633,241 | 252 / 186,732 |
| Final, both runs | 6,349 | 30 | 4,095,203 | 252 / 186,732 |

The final app chunk measured 460,949 bytes versus 583,183 bytes before; the final sandbox bundle measured 246,973 versus 274,106 bytes. The Histoire main bundle was 1,111,067 versus 1,095,953 bytes. Final static requests include a 6,747-byte JavaScript chunk named `HstJsonEditor.vue-…js` once during startup, expected because the selected Code gen variant exposes its generic JSON control. The separate controls package-emission check reports a 536 KB deferred JSON editor output; these measurements describe different build artifacts and are not directly comparable. The runner aggregates script data by URL and drops each request's `frameUrl`, so these results cannot establish whether that request belonged to the host or an ordinary sandbox. Report the bundle split and total network bytes only; do not claim zero editor requests globally.

Dev request totals were 83,327 requests / 823 unique URLs / 1,497,238,420 script response bytes at baseline; after-change runs recorded 58,173 / 793 / 256,133,821 and 56,074 / 711 / 249,820,731. Baseline total canvas sandbox documents were 274, with 33 during startup; final totals were 254 and 252, with 13 and 11 during startup. Baseline startup created 33 canvas sandbox documents during Vite dependency optimization and reload. Dev logs showed Vite's initial dependency optimizer work before timed selections and Cypress-triggered `cypress/downloads/downloads.html` reloads before the repeat. No optimizer/HMR activity was observed during the timed repeat. Because startup differed, dev network totals are contextual rather than a clean like-for-like graph comparison.

Machine-readable runs: [`after-dev.json`](results/after-dev.json), [`after-dev-repeat.json`](results/after-dev-repeat.json), [`after-static.json`](results/after-static.json), [`after-static-repeat.json`](results/after-static-repeat.json), and [`before-static-paired.json`](results/before-static-paired.json). The paired old static run serves the exact saved baseline artifact at `/tmp/histoire-cross-story-baseline-static`; its index SHA and build ID match `before-static.json`. Process-load observations above are the reason the initial static tail increase cannot be assigned solely to the final build.

### Integrated checks

Checks reported by the parent after follow-up fixes:

- Backend focused suite: 27 files, 135 tests passed.
- SDK: 139 unique tests passed across the 27-file suite and elevated sandbox-import retry. The full run had 138 passes and one `EPERM` sandbox-import failure; its import file rerun passed 2/2 (140 passing executions including the repeated test).
- Controls suite: 20 files, 80 tests passed.
- Vue suite: 104 files, 505 tests passed after fixing two lazy JSON timing tests. The earlier 102-file run had 501/504 passes; one sandbox import `EPERM` was resolved by an elevated rerun.
- SDK, backend, Vue, and controls package emission passed. Controls standalone/peer/CSS/types builds passed; emitted core was 63 KB and deferred JSON editor 536 KB.
- Final app build and static example build passed; static example contained 42 stories and 1,095 variants (4 existing empty files).
- Workbench typecheck reports the pre-existing `CanvasViewport.vue` `responsiveDisabled` error at line 117 (before the changes it was line 116).

Browser smoke and final builds are complete. Remaining limits: the Workbench typecheck retains the pre-existing `CanvasViewport.vue` `responsiveDisabled` error; the existing Vitest Cypress helper cannot locate an offscreen virtualized row, though direct-route Vitest browser checks passed; and unrelated CPU workloads prevent clean causal attribution of the static all-ready tail. No timing run was performed after the single paired static repeat.
