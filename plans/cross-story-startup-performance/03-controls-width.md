# Slice 3: remove render-time controls layout reads

## Ownership

Own `packages/histoire-vue/src/components/controls/HistoireControls.ts`, the existing root-size observer lifecycle in `packages/histoire-vue/src/provider/HistoireProvider.ts`, and focused controls host lifecycle tests. Preserve concurrent preset/reset/loading UI edits already in file. No editor lazy-boundary changes (slice 1 owns those).

## Implementation

Current render reads `context.root.value?.clientWidth` whenever custom-control availability is unknown. Trace shows 57/63 ms forced layout on story clicks. Render now reads the provider's cached `context.size` content-box width; it uses 420 px while no root exists and preserves measured zero. `HistoireProvider` owns its existing single `ResizeObserver`, retargets it when the root ref changes, and ignores callbacks after cleanup even if root identity later returns in an A/B/A sequence. It takes one initial `getBoundingClientRect()` measurement after DOM update, outside render, and disconnects through watcher cleanup. No controls-specific observer or new context field was added.

The provider's root has no default padding or border, so its observed content width matches the width needed by the hidden controls frame in the supported layout. SSR or a missing root stays on the 420 px fallback. Observer absence still allows the post-DOM initial measurement. Root replacement, unmount, and late callbacks are covered; no observer is created per snapshot and no width feedback loop is introduced.

## Tests first and proof

`controls-width.spec.ts` uses the existing session and resize-observer fixtures to cover render-time `clientWidth` reads, snapshot rerenders, resize propagation, zero width, the 420 px missing-root fallback, root replacement, queued stale callbacks including A/B/A, and cleanup. The provider observer regression now supplies the required `ResizeObserverEntry.target`.

Baseline focused run failed as expected: controls render read `clientWidth` once; width remained `0px` where the observed root width should be used. After the change, focused controls/provider regressions passed (9 files, 35 tests), and `pnpm --filter @histoire/vue exec tsc --noEmit --pretty false` passed. `git diff --check` passed. Run commands with `login:false` in this environment; login shell fails in mise initialization with a read-only filesystem error. Build and trace recapture remain parent-owned validation.
