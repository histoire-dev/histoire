# Fresh review: slices 01, 02, 03, 08

2026-10-04. Read-only review of current checkout. No source/repository-document edits, builds, typechecks, browser/Cypress/server actions, staging, commits or pushes. Three verified findings: two P2 accessibility defects, one P3 stale-error publication. Prior implementation-review.md closures were context only.

## Verified findings

### 1. [P2] Ordinary tree scrolling removes every keyboard entry point

Location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/stories/StoriesPanel.vue:140` (supporting ownership logic: lines 39–44; tree container: line 121).

Trigger: open a catalog large enough to virtualize, leave focus outside tree, then wheel/touch/scrollbar-scroll until original roving row leaves mounted range. `focused` remains its full-catalog key because watcher examines all logical rows rather than mounted range. Every visible treeitem then has tabindex=-1; tree container has no fallback tabindex.

Impact: Tab cannot enter Stories tree after ordinary scrolling. Keyboard navigation only recovers after a pointer click on a row or scrolling original roving row back into mounted range. This affects both densities because same focus owner drives their recycler.

Evidence: independent production-component test creates 1,000 real catalog stories, mounts real HistoireProvider/StoriesPanel/shared recycler, supplies existing virtualViewport geometry fixture, then sets native scroller.scrollTop=15000 and dispatches scroll. Before scroll exactly one treeitem has tabindex=0; after scroll original row is unmounted, visible treeitems remain, zero have tabindex=0, role=tree container has no tabindex. Probe: `/tmp/histoire-ui-review-round-2/shell/review.spec.ts`, test `ordinary scroll leaves no tree Tab entry after original roving row is recycled`.

Suggested boundary: preserve a live keyboard entry independently of recycled row lifetime. Either focusable tree container restores/reveals logical cursor on entry, or mounted-range tracking assigns a live roving entry while preserving explicit focused intent. Do not steal focus during pointer scrolling.

Missing regression: large production tree, external focused control, ordinary native scroll away from logical cursor, then assert one live Tab entry and keyboard Arrow/Enter navigation. Existing workbench-tree-focus.spec.ts covers explicit End/Home reveal, not ordinary scroll.

Limits: DOM behavior verified in mounted jsdom test with supplied viewport geometry. Real browser Tab delivery remains parent-owned.

### 2. [P2] Search arrow navigation has no accessible active-result state

Location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/search/SearchPanel.vue:184` (keyboard index mutation: line 173; result semantics: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/search/SearchResultItem.vue:36`).

Trigger: query returns multiple hits; keep focus in input, press ArrowDown/ArrowUp. Internal activeId changes and Enter now activates another result, but input exposes neither aria-activedescendant nor aria-controls, results expose no accessible keyboard-active state, and no live active-result announcement exists. Existing aria-current tracks canonical selection instead.

Impact: assistive-technology user has no programmatic indication of which result Enter will open. Canonical aria-current can still identify first hit while keyboard Enter targets second hit.

Evidence: independent mounted test with two exact variant results and first variant selected. ArrowDown changes production SearchResultGroup.activeId; focus remains input; aria-activedescendant/aria-controls absent, no aria-selected=true or aria-live node, aria-current still names Needle one while internal cursor is Needle two. Probe: `/tmp/histoire-ui-review-round-2/shell/review.spec.ts`, test `arrow navigation changes active result while input and results expose no accessible active-result relation`. No class/style assertions.

Suggested boundary: give active results stable unique DOM IDs and expose keyboard cursor through suitable combobox/listbox semantics plus aria-activedescendant, or explicit semantic active-result announcement if retaining native-button list. Include dev command rows. Keep canonical selection separate from keyboard cursor and preserve virtual reveal/native-row activation.

Missing regression: ArrowDown/Up from focused input changes accessible active-result identity to exact intended row, including distant virtualized result and command; Enter opens that same target once.

Limits: absent DOM accessibility relation is verified. Actual screen-reader speech was not tested.

### 3. [P3] Superseded tree selections still publish cancellation errors

Location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/stories/StoriesPanel.vue:57`.

Trigger: mounted preview has variant c selected; click other while its selection acknowledgment waits, then click c. SDK correctly cancels predecessor with RUNTIME_CHANGED and later selection succeeds. Success path guards source/current tuple, but catch checks only component active flag.

Impact: ordinary rapid navigation publishes an error for already-retired selection intent. Current standalone wires error to console.error (`/home/akryum/Projects/histoire/packages/histoire-app/src/app/standalone/mount.ts:51`), so confirmed impact is false error diagnostics, not a visible global alert or incorrect selection.

Evidence: independent mounted production tree with real SDK session/primary preview and existing deferred/sourceFixture helpers. Delay only selection.select for other, then activate c. onSelect receives c, session remains c, yet onError receives RUNTIME_CHANGED from predecessor. Probe: `/tmp/histoire-ui-review-round-2/shell/review.spec.ts`, test `rapid variant selection emits predecessor RUNTIME_CHANGED error after later selection succeeds`.

Suggested boundary: capture local activation generation and exact source intent; publish rejection only while same intent remains live. Preserve real current selection failures. Query/source/target changes and provider retirement must retire predecessor feedback.

Missing regression: rapid A/B activation with deferred predecessor, current success plus no predecessor error; separately verify current live rejection still reports.

## Coverage

- 01: read scoped tokens/fonts, root/native theme wiring, shared offline Carbon registry/aliases; executed theme/icon regressions. No fresh confirmed defect. Network-free production asset loading was not tested here.
- 02: read rail descriptors/buttons, shell/side-pane/inspector chrome, provider-local store, responsive width bounds, pointer/keyboard separator controller, narrow dismissal/focus handoff, standalone ownership. Executed shell, resize and dismissal/focus regressions. No fresh confirmed defect in these boundaries.
- 03: read catalog projection/order/docs-only variants, legacy folder storage/ancestor expansion, roving keyboard logic, warning/failing labels, density wrapper/shared recycler. Executed tree projection, folder and distant End/Home regressions. Findings 1 and 3.
- 08: read source-index controller/debounce/cache/source retirement/loaded-prop tuple attribution, scopes/ranking/activation/docs anchors/commands, Search frame matches/dimming/reveal cursor, provider shortcuts and focus. Executed request/projection, dismissal/focus/frame regressions. Finding 2.
- Read plans README refinements, architecture.md, contracts.md, design-reference.md and slice 01/02/03/08 documents. Inspected supplied Component Rail, Component Story tree, Search light and Search dark PNGs. Stories filter removal follows later user refinements.

## Executed validation

All commands used PATH prefix:
`PATH=/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.local/share/pnpm/.tools/pnpm/10.33.0/bin:$PATH`.

1. `pnpm --filter @histoire/vue exec vitest run src/__tests__/standalone-shell.spec.ts src/__tests__/standalone-folders.spec.ts src/__tests__/workbench-search-dismissal.spec.ts src/__tests__/workbench-search-focus.spec.ts src/__tests__/workbench-search-frames.spec.ts src/__tests__/workbench-tree-focus.spec.ts src/__tests__/panel-resize.spec.ts --maxWorkers=2` — 7 files / 37 tests passed.
2. `pnpm --filter histoire exec vitest run src/node/__tests__/workbench-search.spec.ts src/node/__tests__/workbench-icons.spec.ts src/node/__tests__/workbench-theme.spec.ts --maxWorkers=2` — 3 files / 11 tests passed.
3. `pnpm --filter @histoire/vue exec vitest run --config /tmp/histoire-ui-review-round-2/shell/vitest.config.mts --maxWorkers=2` — initial 2 probes failed from tmp-harness provider source/dist injection mismatch; not product failure. Explicit source alias added only to tmp config. Rerun 1 file / 2 probes passed. Final extended run 1 file / 3 probes passed. These assert reproduced faulty current behavior, not acceptance.
4. `pnpm --filter @histoire/vue exec vitest run /home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/stories/tree.spec.ts --config /tmp/histoire-ui-review-round-2/shell/vitest.config.mts --maxWorkers=2` — 1 file / 6 tests passed.

Final unique set: 11 existing files / 54 existing tests passed; 1 independent file / 3 verified reproduction probes passed. Repeated probe attempts are not added. Counts may overlap other reviewers; do not sum blindly.

## Evidence limits

Focused Node/mounted jsdom validation only. No full suite, rebuild, typecheck, production runtime, Cypress, browser, cross-framework, offline network, actual assistive-technology speech, or mobile touch claim. Existing acceptance history does not negate current probes. No further confirmed actionable defect found in inspected owned paths.
