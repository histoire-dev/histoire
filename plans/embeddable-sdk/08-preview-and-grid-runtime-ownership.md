# 08 — Preview and grid runtime ownership

## Outcome and prerequisites

Depends on: 07.

Existing single/grid engine becomes session-owned isolated runtime with true readiness and explicit hidden preview. Follow [runtime ownership/state contract](public-api.md); retain mocks, prop overrides, generated runtime, and framework support.

## Owned files

- Refactor app/util/{preview-iframe-host,preview-iframe-host-types,preview-request,preview-state-sync,preview-message}.ts into instance-owned adapters, preserving shared helpers.
- Adapt app/stores/preview-runtime.ts and components/story/{StoryVariantSingleIframe,StoryVariantGridSandbox,StoryVariantGridSandboxItem}.vue.
- Extend node/virtual/preview-runtime/{preamble,host-messaging,message-handler,story-loading,variant-bridge,mount}.ts for document identity and scoped ownership; reuse generated module composition.
- Add app/embed/adapters/{preview,runtime-frame}.ts and SDK mounts/hidden.ts.
- Add instance-owned geometry helper shared by single/grid adapters; adapt grid-cell registration/resize/visibility callbacks and wrapper-local scroll/frame mapping. Protocol owns DTO from [runtime geometry](public-api.md#runtime-geometry).
- Add runtime-ownership.spec.ts, runtime-state.spec.ts, hidden-preview.spec.ts and browser preview-grid.spec.ts using existing preview/runtime fixtures.

## Tests first

1. Single/grid state/settings/mocks parity. Grid keeps state for non-selected variants and exact tuple identity when variant IDs repeat between stories.
2. Boot runtime defaults containing callbacks/instances; empty host mirror cannot erase defaults. Patch/reset preserve omitted live fields and prop override semantics.
3. Reload same story and deliver old-document ready/state/source/test response. WindowProxy equality alone must not accept it.
4. Change selection during load, unmount while ready pending, mount competing primary, and replace after awaited teardown. Reject ownership races deterministically.
5. Explicit hidden preview gets real viewport dimensions and performs state/dynamic source/tests; data-only session remains runtime-free.
6. Run mocked HMR story and framework mount failure; retain existing mock reset/import ordering.
7. Per-variant setup (H14): a setupVue3 plugin keyed by variant meta (in-memory fixture store) sees the right meta for each variant in single and grid surfaces; state written by one variant never appears in another; repeated with the Nuxt plugin, recording whether grid variants share one Nuxt app.
8. Globals (H15): settings.update({ globals }) reaches useHistoireGlobals() and setup handlers in single and grid without remount or state loss; invalid keys/values reject without partial update.
9. Appearance from bridge (H12, H16): colorScheme toggles configured sandboxDarkClass (and theme darkClass) in embedded sandbox while browser storage is blocked; embedded sandbox never reads `histoire-color-scheme` storage.
10. Layout (H17): two visible grid cells publish distinct target-attributed content/visible rectangles; runtime.viewport aliases selected cell. Grid/source/host scrolling, container/cell resize, responsive width/height/rotate, and lazy-cell mount/unmount update runtime.viewports. Fully clipped/unmounted cells disappear and clear selected alias. Verify coordinate mapping through nested frame offsets/scales and that stale documents cannot publish layout.

## Implementation steps

1. Turn runtime/frame registration and request queues into controller-owned adapter instances. Pinia delegates to adapter rather than storing globally authoritative active frame.
2. Outer remote preview/grid surface hosts existing story sandbox on Histoire origin. Native wrapper later hosts same remote primary; host never imports story modules.
3. Mint runtime document identity before navigation and include it in new adapter traffic. Preserve existing sandbox fields through additive optional compatibility until all first-party callers migrated.
4. Bind readiness to actual story/variant mount and runtime acknowledgment, not iframe load. Expose source ready separately from selected runtime ready.
5. Receive initial runtime snapshot before applying explicit captured edits. Maintain per-variant grid state; selected state mirror cannot replace other variants.
6. Route patches/reset through existing serialized reconciliation and protected derived controls metadata. Capture reset baseline at first mount for each runtime/variant; use reconciliation rather than replacing state root.
7. Capture target/document on every request. Navigation/HMR replaces document owner, rejects old work, observes late completion, and suppresses stale publication.
8. Complete primary teardown before release. One explorer/preview/grid/hidden resource owns slot; simultaneous attach rejects before executing modules.
9. Implement hidden iframe in session document with real configured viewport; no display:none. Chromium pauses requestAnimationFrame in far-offscreen nested frames, blocking framework readiness. Use transparent fixed container within viewport, pointer-events:none, negative stacking order, aria-hidden and outer iframe tabindex=-1; retain child focus for explicit preview tests. Return normal mount lifecycle and require caller await ready. Verify host remains visually unchanged and interactive.
9a. Deliver globals and colorScheme through the existing PREVIEW_SETTINGS_SYNC path; add `useHistoireGlobals()` to histoire/client and pass globals to framework setup handlers. In embed mode, replace the sandbox `useDark` storage source (histoire-app util/dark.ts) with bridge-provided appearance.
9b. Register each actual variant render-content root, not whole grid iframe. Measure ready visible content/clip boxes and compose source/sandbox/surface offsets/scales into primary mount coordinates. Publish full replacement layout.changed per public-api.md, including entries disappearing after scroll/unmount. Observe root/cell/frame sizes plus relevant scroll containers; coalesce with requestAnimationFrame, deduplicate geometry, and clean all observers/listeners on document teardown.
10. Preserve source-dev bundle aliases/CSS and storyCollectTimeout. No second mount engine or unsupported host runtime loader.

## API changes

Enable preview/grid and explicit hidden primary capability. All runtime-bound methods use captured runtimeId/target per public-api.md. Existing preview protocol imports remain shared compatibility exports.

## Failure paths

Missing variant/runtime, mount failure, mock dependency failure, timeout, stale document, navigation, and competing primary fail distinctly. Failure must not retain primary indefinitely; caller unmount/cleanup completes captured resources. No retry into server tests or automatic hidden runtime.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test src/node/__tests__/embed/runtime-ownership.spec.ts src/node/__tests__/embed/runtime-state.spec.ts src/node/__tests__/embed/hidden-preview.spec.ts
pnpm --filter histoire test:embed:integration preview-grid
pnpm --filter histoire-example-vue3 test:examples
pnpm run lint
~~~

Include source-dev HISTOIRE_DEV=true probe and existing preview/mock regressions. Native wrapper parity gate completes in slice 09.

## Acceptance criteria

- Single/grid standalone and iframe behavior matches canonical state/settings/mocks.
- Late same-story document messages cannot affect replacement; real runtime readiness proven.
- Explicit hidden preview and one-primary enforcement verified.
- Existing framework runtime lifecycle reused; state/callback/prop semantics preserved.
- Single/grid geometry identifies rendered target and clipping, follows scrolling/lazy cells, and never applies old-document positions.

## Non-goals

Host-side story rendering, multiple primary previews in one session, panel UI, provider styling, and screenshot SDK.

## Handoff

Provide instance runtime adapter, document identity/compatibility fields, native attachment seam, target geometry/scroll cleanup, state/reset baseline rules, and source-dev evidence. Slices 09–13 consume ready primary instead of discovering global frames.

## Implementation evidence and integration handoff

Implemented primary attachment in `histoire-app/src/embed/adapters/preview.ts` and `runtime-frame.ts`; native wrappers use the same `session.mount()` lifecycle. The parent-backed view proxy creates no second session or story engine. Empty/docs-only primaries reserve ownership without mounting story modules. A failed ready promise retains ownership until explicit teardown; failed transport cleanup quarantines the reservation rather than releasing an unknown live runtime.

The existing generated preview runtime owns per-variant initial snapshots, state reconciliation, dynamic source, globals and target-attributed layout. `applySerializedState(..., true)` is the reset mode of the existing canonical reconciler: prune added serializable fields while retaining callback slots, custom instances, nested opaque owners, cycles and derived control definitions. Ordinary patches preserve their prior merge semantics and cannot replace live callback/instance slots with wire scalars.

SDK/app geometry composes actual content roots through sandbox, source surface and host container. Full layout replacements omit completely clipped targets and clear the selected alias. Source wrapper and host scroll/resize observers refresh frame offsets even when child content dimensions stay unchanged. Grid selection retains each variant's state and invalidates pending selected-target requests without replacing the shared document.

Vue setup runs against each actual variant app. Nuxt reuses its own app/plugin services with independent payload/state/config and unique app IDs; asynchronous setup scopes serialize temporary fallback context. Scope/context cleanup registers before asynchronous plugin setup and runs after partial failure as well as normal unmount. Svelte uses the separate `useHistoireGlobalsStore()` readable; `$globals` updates without remount. Shared [public API](public-api.md) owns helper syntax and wire contracts.

Cold Vite optimization can retire a Nuxt/source-development source document. Tests capture `NOT_CONNECTED`, disconnected/stale state, then explicitly dispose/reconnect or navigate a test-owned warmup document. The SDK does not retry operations or replay edits/tests. Warmed source-development HMR advances the source revision, allocates a new parent-minted runtime document and drops predecessor replies. Data and mount ports may observe publications in different order; a mount resynchronizes the canonical parent snapshot after its own revision advances. Catalog metadata lives in a detached session projection, preserving getter-only transport adapters.

Denied-storage WebKit exposed an eager MSW `CookieStore` read in a shared vendor chunk. Optional MSW transport now stays lazy for ordinary previews. Hidden previews use a transparent fixed container within the viewport because Chromium pauses framework readiness animation frames in far-offscreen nested frames. Browser proof checks real dimensions, host focus and host interactions; visual inspection confirms no preview pixels appear in the host.

WebKit also exposed concurrent support-module acquisition returning an uninitialized `MountStory` export. Generated support loaders now retain one lazy promise per plugin/document, shared by mount/render consumers; rejected acquisitions stay cached and observed. A test-owned transform removing only that cache reproduces the initialization error against the same current graph (`/tmp/histoire-sdk-08-webkit-unshared-probe.log`); restoring ordinary product code passes. The temporary probe and artifact-copy code were removed from tests.

Recorded focused evidence, separate from workspace/CI milestones:

- Canonical state/ownership/globals/Nuxt setup failure/mock routes: 9 files, 45 passing tests; `/tmp/histoire-sdk-08-units-final.log`.
- Existing frame/state/request/settings/mock regressions plus new lifecycle checks: 13 files, 94 passing tests; `/tmp/histoire-sdk-08-regressions-final.log`.
- SDK primary reservation, teardown, observer errors and source-budget readiness: 8 passing tests; `/tmp/histoire-sdk-08-sdk-final.log`.
- Generated support loader behavior: 2 passing tests, covering shared lazy acquisition and failed acquisition without retries; `/tmp/histoire-sdk-08-client-loader-green.log`.
- Chromium integration: 6 files, 7 passing tests; `/tmp/histoire-sdk-08-browser-final.log`. Includes Vue single/grid, hidden preview, nested clipping/scaling, blocked storage, globals/appearance, Svelte, Nuxt, failed setup replacement, source development mocked HMR and data-only source access.
- WebKit expanded primary integration passed after storage/module-acquisition fixes; `/tmp/histoire-sdk-08-webkit-final.log`. Firefox final primary integration passed; `/tmp/histoire-sdk-08-firefox-final.log`. The coordinating agent owns subsequent milestone reruns.
- Visual artifacts: `/tmp/histoire-sdk-08-runtime-light.png`, `/tmp/histoire-sdk-08-runtime-dark.png`, `/tmp/histoire-sdk-08-hidden-host.png`.
- Protocol/SDK/app/core builds pass through the shared exclusive build lock; combined dependency-order build is `/tmp/histoire-sdk-10-current-build.log`, with subsequent support-loader core build `/tmp/histoire-sdk-08-loader-core-build.log`. Source/test modules remain below 300 lines. Focused lint and `git diff --check` pass.

Slice 09 owns native-provider visual/style isolation; slice 10 owns controls replicas and overlays; slice 13 owns preview/server test cancellation and execution; slices 14–16 own complete standalone adoption, packed consumers and final workspace/browser/CI acceptance. Focused slice evidence does not claim those later gates or publication/deployment.

Static mock follow-up: converting MSW bootstrap to lazy imports exposed Vitest's interceptor importing through its own pending mock-registration queue. The first-party dynamic-import filter now excludes only `@vitest/mocker` bootstrap internals while retaining story mocks. Static cross-origin SDK preview and standalone sandbox tests reproduced readiness timeout before repair and passed afterward. Combined static mock/source-development HMR regression passes (2 files, 2 tests), `/tmp/histoire-sdk-static-bootstrap-regressions.log`; focused filter tests and core build pass. Full standalone Cypress remains coordinating-agent acceptance.
