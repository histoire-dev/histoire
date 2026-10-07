# Slice 2: bound token DOM work

## Contract

Large generated Tailwind categories must render visible rows plus overscan, not every token's samples/details/copy buttons. Preserve token identity, original slot payload/value shapes, search, empty slots, keyboard access to rendered actions, native iframe scrolling, column reflow and variable-height samples. Small generic token stories must retain compatible behavior. No fixed-height clipping of typography/spacing examples. No nested scrolling trap or new user configuration.

## Implementation

Inspect existing virtualization primitives/dependencies before introducing helper. Own `histoire-controls/src/components/design-tokens/*`, associated tests, and Tailwind `runtime/story.ts` integration. Keep runtime/framework dependency direction intact: controls cannot import @histoire/vue. Use existing low-level virtualization if available; otherwise narrow adjacent measured-row helper. Prefer Tailwind-scoped activation if generic arbitrary slots cannot safely virtualize by default. Preserve full logical scroll extent and native document scroll; recalculate columns on width changes, invalidate measurements on search/content changes, clean observers/listeners exactly once. Handle short/empty lists, last item, restored scroll after variant switching, and reduced viewport sizes. Focus must not disappear merely because overscan retires a row with active focus.

Hoist immutable per-category map/token records out of render closure, without changing state ownership or retaining live Vue apps across variants. Coordinate `runtime/story.ts` with slice 1; slice 2 owns edits there.

## Tests first

Use existing controls token fixtures. Assert mounted sample count stays bounded for large data, last token becomes reachable, filtering to last token works and clearing filter recalculates, responsive column changes keep correct token order, measurements handle variable rows, unmount disconnects resources, and original slot/copy payloads remain intact. Test behavior, not Tailwind class strings. Browser agent will verify actual native scrolling, typography/control edits, copy, and same contentDocument.

## Completion

Implementation uses an opt-in `virtualize` component prop enabled only by generated Tailwind categories. Generic `HstTokenGrid` and `HstTokenList` keep their full-render path by default, preserving arbitrary slot behavior. Controls cannot depend on `@histoire/vue/internal`: its existing `HistoireVirtualList` is in a downstream package, so `useTokenVirtualRows.ts` owns a small measured-row helper. It uses native iframe-document scroll/resize events, measured variable row heights, cached prefix sums and binary search, responsive grid row grouping, overscan, native-flow spacers, and a separate focused-row island. Reflow restores the same token action and scrolls it into view only if it moved outside the viewport. Runtime hoists each category's token map, object, and component selection out of its render closure.

Precise files: `packages/histoire-controls/src/components/design-tokens/HstTokenGrid.vue`, `HstTokenList.vue`, new `HstTokenVirtualRows.vue`, new `useTokenVirtualRows.ts`, new `token-window.ts`, updated `tokens.ts`, and new `token-window.spec.ts` / `token-virtualization.spec.ts`; `packages/histoire/src/node/builtin-plugins/tailwind/runtime/story.ts` opts generated categories in and hoists immutable category projections. Slice 1 also added its known-empty story marker to `runtime/story.ts`; preserve that wrapper.

Focused verification: `pnpm exec vue-tsc --noEmit` in `packages/histoire-controls` passed; focused token tests passed, 3 files / 13 tests; full controls suite passed, 19 files / 78 tests; `git diff --check` passed. Component tests cover bounded sample DOM, filter-to-last and filter clear, original slot payloads, measured variable rows, final-row native scrolling, stable observer registration across rerenders, responsive regrouping with focus retention, offscreen deep-focus visibility, observer cleanup, and generic full rendering by default. Browser coverage is authored in `examples/vue3/cypress/e2e/tailwind-switch-performance.cy.js`; it still needs execution against dev and static builds.

Known limits: browser find-in-page and printed output only see mounted rows; search and native scrolling expose all rows in the interactive canvas. A real-browser probe traversed beyond the initial window with ordinary Tab (past 15 copy-key actions to the `red950` match), so no custom sequential Tab handling is added. No timing improvement is claimed until the baseline agent repeats the same dev/static measurements. Avoid changing external API just to simplify tests; `virtualize` is an implementation prop for generated Tailwind stories, not a Histoire user configuration setting.
