# 14 — Screenshots from the canvas

## Outcome and prerequisites

Depends on: 05. Dev only.

The toolbar screenshot popover captures the selected frame or all frames at 1×/2×/3×, PNG or WebP, to `.histoire/screenshots/`, with a recent-captures list (copy path). The frame context menu gets "Screenshot". Capture runs server-side through the same browser executor MCP uses, so results match MCP `capture_screenshot`.

## Owned files

- Add `app/components/canvas/toolbar/ScreenshotPopover.vue` and register the menu action (slice 13).
- Add `packages/histoire/src/node/server/ui-channel/{index,screenshot}.ts` and `app/util/ui-channel.ts` (typed wrapper over `import.meta.hot` custom events) per [contracts](contracts.md).
- Reuse `packages/histoire/src/node/mcp/browser/screenshot.ts`, `preview-host.ts`, and the shared execution lane (`runtime/execution-service.ts`); no second Playwright launcher.

## Tests first

1. `histoire:ui:screenshot` with N targets enqueues N captures on the execution lane and returns file paths in one result event.
2. Viewport, scale, format, and background are passed to the preview host exactly as the MCP tool does.
3. Concurrent UI and MCP captures are serialized by the lane; cancelling the UI request does not cancel MCP jobs.
4. Missing Playwright returns a typed "unavailable" error; the popover shows install instructions.
5. Output paths stay inside `.histoire/screenshots/`; file names derive from story/variant IDs and are sanitized.
6. Static builds hide the screenshot tool.

## Implementation steps

1. UI channel server module registers on the dev server's Vite instance; validates payload size and shape before enqueueing.
2. Recent captures list is in-memory per session plus a directory listing on open.
3. Background "transparent"/checker maps to the preview host's background option; checker renders as transparent PNG.

## Failure paths

Capture timeout or render error per target is reported per file; partial success is shown as such.

## Validation commands

~~~bash
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire test:mcp:integration
pnpm --filter @histoire/app build
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the Toolbar — Screenshot boards; captured images match MCP captures for the same target.

## Non-goals

Visual diffing/baselines, screenshots in static builds, uploading captures.

## Handoff

UI channel module conventions (validation, size limits, error shape) for slices 15–17.
