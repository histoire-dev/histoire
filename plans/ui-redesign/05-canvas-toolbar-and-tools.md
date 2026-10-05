# 05 — Canvas toolbar and tools

## Outcome and prerequisites

Depends on: 04.

A floating 36px toolbar centered over the canvas: Select/Pan switch, Arrange (grid, list, matrix — matrix enabled in 07), viewport menu, rotate, zoom out / level menu / zoom in, background picker, measure, screenshot (enabled in 14), and comment tool (enabled in 17). All controls share one 28px box and centered icon alignment. Popovers anchor under their button and close on Escape or outside click.

## Owned files

- Add `app/components/canvas/toolbar/{CanvasToolbar,ToolSwitch,ArrangeSwitch,ViewportMenu,ZoomMenu,BackgroundPicker,ToolbarButton,ToolbarPopover}.vue`.
- Add `app/components/canvas/FrameList.vue` (list arrangement) and `app/components/canvas/MeasureOverlay.vue`.
- Add measure handling to the preview runtime: new handler for `MEASURE_REQUEST` in `packages/histoire/src/node/virtual/preview-runtime/` (new module; do not edit runtime-imported app files).
- Add `MEASURE_REQUEST`/`MEASURE_RESULT` to `packages/histoire-shared/src/types/preview-message.ts` per [contracts](contracts.md).
- Remove `app/components/toolbar/*` once no view uses them (keep `data-test-id="toolbar-background"` on the new picker).

## Tests first

1. Viewport menu selects presets from `responsivePresets`, supports custom width × height, and writes `_histoire-sandbox-settings-v3`; "Edit presets…" navigates to settings (12).
2. Rotate swaps width/height and persists `rotate`.
3. Zoom menu: Fit, Zoom to selection, 25–200%, shortcuts ⇧1/⇧2/⇧0; sync-zoom setting respected.
4. Background picker lists `backgroundPresets`, checker, and a custom hex; "Apply to" all frames vs selected frame.
5. Arrange: list arrangement renders one row per variant; `arrange` query round-trips; unknown value falls back.
6. Measure: hovering inside the selected frame sends `MEASURE_REQUEST` with frame-local coordinates; the overlay draws the element box, size, and distances to the frame edges; turning measure off clears it; an older runtime without a reply shows nothing.
7. Popover focus: opening moves focus into the popover; Escape returns focus to the button.

## Implementation steps

1. One `ToolbarButton` component (28px, `display:flex` centering, block-level svg) for every control; pressed/open state from props.
2. Popovers use FloatingVue (already installed) or a small shared positioning helper; one open at a time.
3. Convert pointer positions from canvas to frame CSS pixels with slice 04 helpers before sending measure requests; throttle to animation frames.
4. Keep tool state in `stores/canvas.ts`; Space-hold temporarily sets `pan` and restores the prior tool.

## Failure paths

Measure on cross-origin or unavailable frames is disabled with a tooltip. Invalid custom size is rejected with inline validation.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Toolbar matches the canvas toolbar boards (Pan, List, Viewport, Rotated, Zoom, Background, Measure) in both themes.
- Every tool affects previews through existing settings/protocol; measure works in vue3, svelte4, nuxt4 examples.

## Non-goals

Screenshot capture (14), matrix (07), comment tool (17), MCP preview host changes.

## Handoff

Toolbar slot API for later tools, popover helper, measure message implementation notes.
