# Fresh implementation review — Canvas, tools, Matrix, frame actions

Reviewer scope: slices 04, 05, 07, 13, 20. Read-only review of current shared checkout. No source/repository documentation edits, package builds/typechecks, Git writes, server starts, browser operations, or Cypress runs. Behavior probes/config live only under `/tmp/histoire-ui-review-round-2/canvas`.

## Verified actionable findings

### C1 — [P2] Matrix cells never open their exact-target frame menu

Source: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/canvas/matrix/MatrixCell.vue:61` (section) and `:65` (focused selection button). Ordinary `CanvasFrame.vue` binds `contextmenu` and ContextMenu/Shift+F10; MatrixCell binds neither. Existing Matrix frame registry already carries exact base variant and local cell key.

Trigger: enter Matrix, right-click a cell or focus its selection button and press Shift+F10/ContextMenu. Canonical variant selection need not change.

User impact: Matrix cells lose frame menu actions, including exact cell screenshots, source/snippet operations and AI context. Pointer opens native browser menu; keyboard yields no Histoire menu. Selected-cell frame shortcuts also have no Matrix chrome scope in `standalone/workbench.ts:138-142`, although toolbar action target resolver can resolve the selected cell.

Verification:

- Actual MatrixCell SFC, actual canvas registry/Matrix/context-menu stores and real SDK fixture: `/tmp/histoire-ui-review-round-2/canvas/menus.spec.ts`, separate pointer/Shift+F10 probes. Both fail expected behavior with `menu.state.target === null`; expected tuple is `{ storyId: 'a:b', variantId: 'c', frameKey: '["a:b","enabled",false,"emphasized",false]' }`.
- Root independent live browser: 4 ready no-hint Boolean cells at WorkbenchMatrix `variantId=default&arrange=matrix`; right-click false·false leaves AX unchanged and `[role=menu]` count 0. Root owns that browser evidence; this reviewer did not operate browser.

Fix boundary: share/reuse ordinary frame menu activation with Matrix chrome; capture current `frame.id`, `frame.storyId`, and current base `variantId`. Preserve local Matrix/canonical selection on menu opening. Update frame shortcut scope to exact registered Matrix chrome rather than inferring only canonical Grid selection. Existing frame registry and source/override ownership remain authority.

Regression: mount actual MatrixCell and prove pointer, Shift+F10 and ContextMenu capture exact local frame/base tuple without changing canonical selection; base preset replacement updates tuple; keyboard frame action resolves same current cell. Browser coverage should exercise ready Matrix cell screenshot/source action with its displayed overrides.

### C2 — [P2] Measure hit surface consumes all pan gestures

Source: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/canvas/MeasureOverlay.vue:119`. Owner/enablement at `:19` depends on `canvas.measure`, not Pan/Space intent. Teleported hit surface uses unconditional `@pointerdown.prevent.stop` and click locking. It does not route pointer gesture to existing CanvasViewport controller. `ToolSwitch.vue` changes Pan tool without disabling Measure.

Trigger: select ready preview/cell, enable Measure, then choose Pan and start drag inside preview. Middle-mouse drag and an already held Space+drag start at same hit surface.

User impact: preview does not move; completed drag toggles/locks measurement. Pan is visibly pressed but ineffective over selected preview. Existing guarantee that every canvas view pans by hand, middle mouse and Space is broken while Measure remains enabled.

Verification:

- `/tmp/histoire-ui-review-round-2/canvas/measure-pan.spec.ts`: real MeasureOverlay SFC, actual registry/store, real SDK session fixture, existing `usePointerPan`. Positive control dispatching each gesture on canvas starts pan; same hand/middle/held-Space pointerdown on actual teleported measurement hit leaves `isPanning === false`. All 3 expected-behavior probes fail at final assertion. Earlier probe setup errors were corrected before retaining evidence.
- Root native browser: selected real ready false·false Matrix cell, Measure+Pan both pressed. Cell bounds before drag: x=495.9906, y=306.25. Drag [565,365] to [610,400] leaves bounds exactly unchanged and produces `720×640 Locked`/Unlock measurement. Root screenshot `/tmp/histoire-ui-review-round-2/measure-pan.png`.

Fix boundary: measurement surface must yield/relay accepted pan gestures into existing shared pointer-pan path, including capture/move/up/cancel, and suppress measurement click after drag. Share pan intent/controller with overlays rather than add second pan engine. Preserve keyboard Enter/Space lock activation while ensuring canvas Space hold remains usable. Keep actual document/source measurement guards and click-lock behavior.

Regression: mounted integration test all three gestures starting on Measure hit surface changes canvas offset without toggling lock; pointer cancel releases capture; ordinary primary click still locks/unlocks. Browser exercise Measure+Pan then middle/Space, including Matrix selection.

## Executed checks

PATH for all test commands: `/home/akryum/.local/share/mise/installs/node/24.16.0/bin:/home/akryum/.local/share/pnpm/.tools/pnpm/10.33.0/bin:$PATH`. All runs capped at `--maxWorkers=2`; own runs sequential.

1. From `packages/histoire`: `pnpm exec vitest run src/node/__tests__/canvas-pan.spec.ts src/node/__tests__/canvas-frames.spec.ts src/node/__tests__/canvas-geometry.spec.ts src/node/__tests__/canvas-focus.spec.ts src/node/__tests__/canvas-registry.spec.ts src/node/__tests__/canvas-frame-state.spec.ts src/node/__tests__/canvas-replica-url.spec.ts src/node/__tests__/canvas-measure.spec.ts src/node/__tests__/canvas-measure-owner.spec.ts src/node/__tests__/ui-frame-actions.spec.ts src/node/__tests__/ui-shortcuts.spec.ts src/node/__tests__/frame-variant-source.spec.ts src/node/__tests__/preview-matrix-isolation.spec.ts --maxWorkers=2` — **13 files, 76 tests passed**.
2. From `packages/histoire-vue`: `pnpm exec vitest run src/__tests__/workbench-matrix.spec.ts src/__tests__/workbench-matrix-detection.spec.ts src/__tests__/workbench-matrix-registration.spec.ts src/__tests__/workbench-matrix-ownership.spec.ts --maxWorkers=2` — **4 files, 26 tests passed**.
3. Isolated mounted probes from `packages/histoire-vue`: `pnpm exec vitest run --config /tmp/histoire-ui-review-round-2/canvas/vitest.config.mjs menus.spec.ts --maxWorkers=2` — 3 expected-behavior failures: 2 Matrix activation modes plus low-impact passive menu readiness gap below.
4. Same config, `measure-pan.spec.ts --maxWorkers=2` — 3 expected-behavior failures, all positive-control checks pass and final pan-on-hit assertion fails.

Existing focused baseline total: **17 files, 102 tests pass**. Probe failures are independent fresh expected-behavior evidence, not failures from baseline repository test suites.

## Coverage and limits

Read README refinements, contracts, architecture, all 5 assigned slice plans, Matrix extension ownership requirements, current implementations and behavior tests. Inspected primary/passive sessions, registry cleanup, canonical state cache/generation, layout/budget and fit geometry, pointer/Space/iframe input bridge, toolbar settings/popover placement, measurement lock/document guard, automatic first-owner finite metadata detection/chooser bootstrap/filter persistence, base preset registry/source readiness, typed scalar identities, framework variant wrapper, scoped shortcuts and captured frame actions. Viewed supplied Matrix, Measure, Pan, Right-click and toolbar-popover PNG authorities. Historical 27 closures used only as pointers; no prior pass assumed current proof.

Passed tests preserve inspected ownership and pure math behaviors; they do not establish full UI visual fidelity, performance, untested real-browser inputs or cross-framework acceptance. Root owns browser/dev/static/cross-framework gates. No package build/typecheck/full suite was run by this reviewer.

Verified low-impact gap omitted from actionable findings: opened passive-frame menu does not rerender Save props readiness when only that passive session becomes ready (`ContextMenu.vue:21-24` tracks canonical snapshot). Actual SFC probe: direct `action.disabled(target)` clears while rendered native button stays disabled. Reopening menu reevaluates state, and `actions.run` guards readiness, so no unsafe execution; root requested no P3 padding.

Unverified concern, not promoted: measurement hit uses full teleported iframe client bounds and no canvas/chrome clipping. A heavily panned selected preview may overlap fixed toolbar or other surfaces. Browser hit-testing impact not established by this reviewer; confirm before filing separately. Inspector z-index 30 exceeds Measure 25, so inspector overlap cannot be assumed.
