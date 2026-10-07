# Slice 1: reduce sandbox startup imports

## Ownership and diagnosis

Own generated runtime imports under `packages/histoire/src/node/virtual/preview-runtime/`, narrowly needed app sandbox entry/build inputs/utilities, controls lazy editor boundary, and associated backend/controls tests. Coordinate source list before editing shared controls files. Do not change canvas scheduler, HistoireControls width behavior, SDK descriptor internals, or browser harness.

Start from `preview-runtime/preamble.ts`, `story-loading.ts`, app `bundle-sandbox.js`, `util/controls-document.ts`, `util/docs.ts`, plugin setup, `packages/histoire-controls/src/index.ts` and build config. Trace loads full controls and CodeMirror into every ordinary canvas. Follow static imports to identify why; avoid speculative wholesale bundler changes.

## Implementation

1. Write regression(s) for actual lazy boundary and behavior using existing control/runtime fixtures. Record initial dependency graph from built artifacts/network with baseline agent.
2. Keep minimum bootstrap imports synchronous: selection/readiness, state bridge, mock installation ordering, story mount/render, settings and required plugins.
3. Move editor-heavy controls implementation behind existing control component contract using a small async wrapper/module if needed. Preserve props, model updates, slots, emits, focus handles, loading/error behavior, declarations, standalone and peer Vue builds. Do not make ordinary native controls async unnecessarily.
4. Lazy-load source-generation/custom-controls-only helpers at their action/surface boundary where semantically safe. Keep story setup/plugin registration behavior unchanged. A registered control must remain usable even when first rendered inside story content.
5. Runtime features still await their dependencies before replying ready/result. Cancellation/error paths must respect existing document and selection-version ownership. No artificial early ready.
6. Preserve Vitest mock shim ordering, dynamic import interception, dev/static behavior, framework plugin aliases and one Vue instance per document. Do not prefetch delayed chunks unconditionally.
7. Remove dead eager imports only after proving generated runtime consumers no longer need them. No public export removal or protocol field changes.

## Proof

Focused generated runtime, selection/readiness, dynamic source, controls, copy, state editor and mocking tests. Typecheck relevant controls/backend/app graph; standalone and peer controls builds plus app/static build via parent. Browser must exercise BaseButton/Codegen, ordinary controls edits, dynamic source, JSON editor when requested, and Vitest-mocked story in dev/static. Record initial graph and later on-demand editor requests. If a proposed lazy boundary cannot preserve public control contract, report and choose smaller safe boundary.

## Implemented source boundary — 2026-10-07

Baseline capture reported the generated sandbox loading the grid sandbox statically and the controls barrel loading CodeMirror through `HstJson`; the trace contained 14 controls/editor loads, 3,821 requests, and 210 MiB. The plugin's global Vue controls registration remains eager, so this slice removes the editor from that required barrel path and removes grid-only modules from ordinary single-story sandbox startup. Post-change bundle/browser measurements remain with the parent build pass.

`preview-runtime/preamble.ts` now memoizes a literal dynamic import for `StoryVariantGridSandbox.vue.js`, retrying after a rejected import. `preview-runtime/app.ts` loads the selected story and grid dependency together, switches into grid mode only after both succeed, and returns its selection token. `message-handler.ts` checks that token after awaits and suppresses stale readiness. This covers both initial URL selection and later `PREVIEW_SYNC` layout changes without mounting an undefined grid component or publishing ready for a superseded selection.

The public `HstJson.vue` component is now a small wrapper around shared lazy loader `HstJsonEditorAsync.ts`; the existing CodeMirror implementation lives in `HstJsonEditor.vue`. While loading or after a failed import, the wrapper keeps the control label and custom actions visible, shows a local status/error, and offers Retry. Concurrent controls share the pending module request, and rejected requests can be retried. The wrapper forwards props, attrs, slots, model updates, and the public `focus()` handle. Focus requested while an enabled wrapper is mounted waits for the editor's mount hook and is discarded on disable or unmount. `model.ts` and `index.ts` keep targeting/exporting the same public wrapper, so their contracts did not need edits. The initial editor document is marked as external state to avoid a spurious model update when the delayed component mounts.

The app source entry `packages/histoire-app/src/app/index.ts` already exports `StoryVariantGridSandbox`, so no additional app build input was needed. No optional docs/source-generation imports were split because this slice had no graph evidence that doing so would materially reduce startup.

Added executed-runtime regressions for delayed initial grid readiness and later grid selection superseded by a newer single-story selection. Added controls regressions for lazy package imports, latest props, focus after mount, unmount before module resolution, and visible/retriable loader failure. Updated existing JSON editor and generic-control state tests to wait for the intentionally asynchronous editor mount or control readiness.

Focused proof passed with Node 24.16.0: 19 runtime tests across `preview-runtime-grid-lazy.spec.ts`, `preview-runtime.spec.ts`, and `preview-runtime-reload.spec.ts`; 4 controls tests across `HstJson.lazy.spec.ts` and `HstJson.spec.ts`; 2 `controls-json-state.spec.ts` tests; controls `vue-tsc --noEmit`; backend `tsc --noEmit`; changed-file ESLint; and `git diff --check`. This agent did not run package builds or post-change browser/network capture; parent owns those checks.
