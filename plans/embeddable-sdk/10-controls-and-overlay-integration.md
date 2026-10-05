# 10 — Controls and overlay integration

## Outcome and prerequisites

Depends on: 08, 09.

Generic controls edit session state; custom controls execute in story-compatible replica frame. Built-in overlays escape iframe clipping through owning provider host. [public-api.md](public-api.md) owns state/runtime/overlay restrictions.

## Owned files

- Add Vue components/controls/{HistoireControls,GenericControls,PropControl,StateControl}.vue, splitting responsibilities below 300 lines.
- Reuse/extract app panel/ControlsComponent* and StatePresets behavior rather than duplicate control mappings.
- Adapt app panel/{StoryControls,StoryControlsSandboxIframe,StoryControlsOverlay}.vue, composables/controls-host.ts, and controls overlay/geometry/focus utilities.
- Add Vue overlays/{host,geometry,focus,appearance}.ts plus source-wrapper relay in app/embed/adapters/controls.ts.
- Extend existing controls/runtime overlay tests; add browser controls-overlays.spec.ts and controls-provider-isolation.spec.ts.

## Tests first

1. Generic state/automatic prop edits reach canonical preview; preview changes return to generic/custom controls with no echo loop.
2. Custom controls for mocked story retain same-origin module/mocking behavior and cannot become canonical owner.
3. Long dropdown crosses sandbox and wrapper boundaries; opaque option ID resolves inside controls runtime, including object-valued/callback choices.
4. Nested frame geometry handles host scroll/resize, frame scaling, root/container offsets, and intrinsic-height shrink.
5. Outside click, Escape, focus return, Tab/Shift+Tab traversal, and theme work in cross-origin native host.
6. Navigate/reload/unmount while overlay open; stale option/focus/height reply cannot touch replacement. Two providers never share overlay.
7. No primary runtime yields explicit unavailable controls without mounting story automatically.

## Implementation steps

1. Build native generic control model from selected runtime's derived definitions plus serializable state mirror. Use host-peer controls components and session patch/reset.
2. Keep derived definitions runtime-owned/read-only. Preserve existing automatic prop override and presets; callbacks/non-serializable presets resolve at runtime, not transferred to host.
3. Reuse dedicated custom-controls sandbox as replica. Its edits route to primary runtime and correlated acknowledgment updates replica; preview remains canonical.
4. Keep custom frame and Histoire wrapper communication same-origin. Cross-origin parent receives only finite wrapper command envelopes bound to session/mount/runtime.
5. Relay built-in overlay labels, opaque IDs, scope, and anchor geometry to provider root overlay target. Never transfer values, callbacks, component instances, or arbitrary rendered HTML.
6. Translate rect through each frame level using bounding rect/client viewport ratios and root positioning. Recompute on resize/scroll using scoped listeners; deduplicate updates and dispose them.
7. Route selected opaque ID back to controls runtime; verify active overlay/document before invoking local callback.
8. Implement explicit focus actions over bound protocol. Preserve keyboard traversal, Escape/outside dismissal, and restoration; never use arbitrary host DOM selector.
9. Preserve height reporting both growth/shrink and source theme. Provider overlay remains local; no global Teleport target or FloatingVue mutation.
10. Clear relay maps, observers, focus requests, and open overlays before selection/document teardown. Defer capability until primary/controls ready.

## API changes

Enable HistoireControls and controls iframe surface. Internal finite overlay messages extend protocol validators consistently. Runtime requirements and error semantics remain public-api.md; no standalone controls execution engine.

## Failure paths

Unavailable/missing primary, replica mount failure, stale overlay ID, malformed geometry, and lost runtime reject/drop scoped operation. Cleanup cannot call stale callbacks or restore focus into detached frame. Unsupported custom overlay content remains runtime-local rather than widening generic execution endpoint.

## Validation commands

~~~bash
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/controls build
pnpm --filter @histoire/controls test
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test:embed:integration controls-overlays controls-provider-isolation
pnpm --filter histoire-example-vue3 test:examples
pnpm run lint
~~~

Run existing slot-controls/host-overlay scenarios in standalone and cross-origin native host. Geometry/focus requires real browser proof.

## Acceptance criteria

- Generic/custom controls keep primary canonical state and retain mocking/prop behavior.
- Cross-frame overlays, geometry, focus, theme, height, and two-provider cleanup verified.
- Values/callbacks stay in owning controls runtime.
- Missing runtime does not execute stories or present falsely editable control panel.

## Non-goals

Arbitrary host rendering of custom controls, serializing object identity, generic remote callback API, and automatic hidden preview.

## Handoff

Provide controls replica adapter, overlay/focus finite messages, geometry assumptions, keyboard/height browser evidence, and cleanup rules. Slice 14 adopts same controls implementation; slice 16 broadens focus smoke across browsers.
