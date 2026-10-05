# 04 — Canvas viewport and frames

## Outcome and prerequisites

Depends on: 02. Confirm open decision 3 (frame budget) first.

The story route renders a pannable, zoomable canvas. Each variant is a frame (label row with status icon + preview sized by the current viewport preset). Frames arrange as a grid by default. Panning works with Space+drag, middle mouse drag, and the hand tool; wheel scrolls/pans, ctrl/⌘+wheel zooms around the cursor. Selecting a frame selects the variant. Collect errors show the last good render dimmed with an error card.

## Owned files

- Add `app/components/canvas/{CanvasViewport,CanvasFrame,FrameGrid,CanvasHeader,CanvasStatus,CollectErrorCard}.vue`.
- Add `app/components/canvas/pan/{usePanZoom,usePointerPan,useSpacePan}.ts` (pure pointer/transform logic, unit tested).
- Add `app/stores/canvas.ts` (`zoom`, `tool`, `panOffset`, `selectedFrame`; key `_histoire-ui-canvas`) and `app/composables/selection.ts` (`useSelection` over router `storyId`/`variantId`).
- Reuse `util/preview-iframe-host.ts` and `getSandboxUrl` for each frame; do not change `StoryVariantGridSandbox` or other runtime-imported files.
- Replace `StoryViewer`/`StoryVariantSingle*`/`StoryVariantGrid` usage in `StoryView.vue` with the canvas. Keep the old files until slice 06 removes the old view, then delete unused ones (except runtime-imported paths).

## Tests first

1. Pan math: Space+drag, middle-button drag, and hand-tool drag produce the same offset delta; releasing Space restores the previous tool; Space is ignored while typing in inputs.
2. Zoom around cursor keeps the point under the cursor fixed; zoom clamps to [0.1, 4]; "fit" computes zoom that fits all frames in the visible area minus the inspector.
3. Frame budget: with N frames > budget, only frames intersecting the viewport (plus margin) mount iframes; scrolling mounts/unmounts without losing selection.
4. Clicking a frame sets `variantId`; changing `variantId` via URL scrolls the frame into view.
5. Collect error: when a story's collection fails, frames keep the last good iframe URL marked stale and the error card shows file, message, and code frame.
6. `histoire:story-changed` re-renders affected frames only.

## Implementation steps

1. Canvas is a positioned layer transformed with `translate(x,y) scale(z)`; frames are laid out in canvas coordinates. Text in frame labels stays crisp by counter-scaling labels or rendering labels outside the transformed layer.
2. Each frame embeds one sandbox iframe at the preset viewport size (`_histoire-sandbox-settings-v3`), scaled by zoom. Preview settings sync per iframe through the existing host composable.
3. Pointer handling: `pointerdown` with button 1 (middle) or tool `pan` or Space held starts a pan; set `cursor: grabbing`; capture the pointer; prevent middle-click autoscroll. Iframes get `pointer-events: none` while panning so drags over frames work.
4. Status line shows viewport size, zoom, and background; hidden while a pan hint is shown.
5. Story `layout.type: 'grid'` maps to the grid arrangement; `single` maps to grid with one frame focused. Docs-only stories route to the Markdown page (slice 11) instead of the canvas.
6. Keep `data-test-id="preview-iframe"` on the selected frame's iframe and `responsive-preview-bg` on frame backgrounds.

## Failure paths

Iframe load error shows a frame-level error with retry. Budget overflow shows placeholders with the variant name. Missing preview runtime messages time out to a "preview unavailable" state, never a blank frame.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-svelte4 test:examples
~~~

## Acceptance criteria

- Story view is the canvas in both themes; panning works with all three methods; zoom is smooth and anchored.
- Variant selection, controls state sync, events, and tests keep working through the new frames.
- Performance: a 30-variant story stays interactive (manual check) with the budget enforced.

## Non-goals

Toolbar controls (05), inspector content (06), matrix (07), manual frame resizing.

## Handoff

`usePanZoom` API, frame registry (for measure, screenshots, comments), canvas↔frame coordinate helpers, and budget numbers.
