# 07 — Props matrix

## Outcome and prerequisites

Depends on: 04, 06.

Arrange → Matrix renders every combination of two prop axes (rows × columns) for the current story. Axes are chosen from props with finite value sets (enums, booleans, explicit value lists). All other props are **base props** shared by every cell and edited in the inspector. Variants that don't fit the matrix stay in Grid. Selecting a cell lets the user copy it as a variant snippet.

## Owned files

- Add `app/components/canvas/matrix/{MatrixView,MatrixAxisBar,MatrixCell}.vue` and `app/util/matrix.ts` (axis discovery, combination expansion, cell keys).
- Add `app/stores/matrix.ts` (per-story `rows`, `cols`, value filters, `base`; key `_histoire-ui-matrix/<storyId>`).
- Add `PROPS_OVERRIDE` handling in a new preview-runtime module and the message type in `packages/histoire-shared/src/types/preview-message.ts`.
- Extend `app/components/inspector/PropsTab.vue` with matrix mode: "Base preset", selected-cell strip, **Axes** section (multi-select value filters), **Base props** section (all non-axis props).
- Support plugins: expose finite prop value sets where available (`packages/histoire-plugin-vue/src/client/app/auto-props.ts` already records `_hPropDefs`; add enum/union detection only if the definition carries it). Svelte/others fall back to booleans + explicit `matrix` hints.

## Tests first

1. Axis discovery: booleans and enum-like props become candidates; free text/number props do not; a story-level `matrix: { axes: { size: ['sm','md','lg'] } }` hint (optional, additive) adds explicit values.
2. Expansion: rows × cols produces stable cell keys; value filters remove rows/columns; empty filters show an empty state.
3. Base props: editing a base prop sends `PROPS_OVERRIDE` to every live cell; the selected cell strip reflects axis values + base props.
4. `arrange=matrix&rows=variant&cols=size` restores the matrix; invalid prop names fall back to the first candidates.
5. Swap axes swaps rows/cols and persists.
6. Frame budget applies to cells; offscreen cells show placeholders.
7. "Save as variant" copies a `<Variant>` snippet (framework-specific via the support plugin's source generator) to the clipboard; no file write.

## Implementation steps

1. Each cell is a frame of the base variant (the story's first variant or a chosen base preset) plus `PROPS_OVERRIDE` with axis + base values. The runtime merges overrides into the variant's prop state before render, using the same path as controls edits.
2. Matrix layout uses the canvas from slice 04 (pan/zoom/budget) with axis labels rendered outside the transformed layer.
3. Inspector matrix mode replaces per-variant props editing; leaving matrix mode restores normal props.
4. Cell selection sets local `selectedCell`, not `variantId` (cells are not variants); the URL keeps the base variant.

## Failure paths

Stories without candidate props disable the Matrix button with an explanatory tooltip. Runtime without `PROPS_OVERRIDE` support shows cells as "update the preview runtime".

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter @histoire/plugin-vue build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the Story — Props matrix boards in both themes.
- Base props edits apply to every cell; axis filters and swap work; state restores from URL and storage.
- Works for Vue 3 (auto props) and with explicit hints for Svelte.

## Non-goals

More than two axes, writing variants to source files, matrix tests runs.

## Handoff

`PROPS_OVERRIDE` semantics, axis discovery rules, and the optional `matrix` story hint (document in slice docs update).
