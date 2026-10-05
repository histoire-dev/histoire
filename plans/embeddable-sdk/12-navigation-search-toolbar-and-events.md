# 12 — Navigation, search, toolbar, and events

## Outcome and prerequisites

Depends on: 09, 11.

Independent navigation/search/settings/events use provider/session without explorer or host router. Preserve ranking and standalone command integration. [public-api.md](public-api.md) owns target, settings, event identity/retention, and capabilities.

## Owned files

- Add Vue components/tree/HistoireStoryTree.vue, search/HistoireSearch.vue, toolbar/HistoireToolbar.vue, events/HistoireEvents.vue and small per-part models.
- Reuse/extract existing app tree/*, search/*, toolbar/*, events panel, ranking/index helpers, and settings controls.
- Extend shared source search adapter using existing Fuse/title/docs index behavior; no new competing search engine.
- Add provider focus/keyboard scope and source-frame focus notifications.
- Register tree/search/toolbar/events iframe surfaces; standalone commands remain app adapter.
- Add Vue navigation/events/keyboard tests and browser independent-panels.spec.ts.

## Tests first

1. Tree and search update after catalog/Markdown changes, retain existing ranking/docs matches, and activate exact structured target.
2. Same IDs in two sessions return local target; docs-only and explicit-null story choice stay valid.
3. Toolbar settings persist in session without preview, then apply when primary mounts. Invalid patch rejects without partial update.
4. Events carry exact story/variant/runtime identity, retain/drop bounded history, clear, unsubscribe, and suppress stale document events.
5. Two providers plus host shortcuts: only active provider focus scope responds. Independent search/panels do not require router/explorer.
6. Static open-in-editor action unavailable; dev capability resolves only collected target, never host-supplied arbitrary path.
7. A story calling `logEvent(name, payload)` from histoire/client (including a DOM event and a nested object) delivers one events.appended entry per call to `events.subscribe` with sequence, timestamp, story/variant/runtime identity, and JSON-safe payload, in both single and grid surfaces (factory H2).

## Implementation steps

1. Tree model uses portable catalog identity/path, not internal array index or router location. Select via session; derive active row from coherent snapshot.
2. Run search against source title/docs data with existing Fuse/ranking behavior. Return portable results with target/rank/excerpt, not commands or router URLs.
3. Preserve lazy docs-search index and revision invalidation. Avoid shipping app/framework dependencies into SDK catalog.search.
4. Build toolbar over session settings. Responsive/background/direction/appearance components reuse scoped foundation; no host body/theme mutation.
5. Gate editor action behind dev capability. Internal finite command resolves catalog target to known project file on source, using existing editor service; do not expose arbitrary file/URL input.
6. Events consume session retained snapshot/stream, not global emitter. Keep current-variant display semantics and use runtime identity to reject stale entries.
7. Implement keyboard scope from provider root/owned source-frame focus. Attach cleanup-scoped handlers; preserve host shortcuts when provider inactive and avoid double handling across iframe/native wrappers.
8. Register each iframe part against parent-backed session. None independently starts story runtime, changes host URL/title, or installs global router/store.
9. Preserve standalone command palette and plugin commands through standalone-only adapter. Do not expose generic plugin invocation on external bridge.

## API changes

Enable HistoireStoryTree, HistoireSearch, HistoireToolbar, HistoireEvents and equivalent iframe surfaces. Search target and settings/event contracts unchanged. Editor integration remains capability-gated first-party action.

## Failure paths

Failed catalog/search content exposes status distinct from zero matches. Stale search requests ignored; deleted target rejects selection. Toolbar/source failure cannot leave phantom runtime setting acknowledgment. Invalid/stale event/focus owner cannot activate another provider.

## Validation commands

~~~bash
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test:embed:integration independent-panels
pnpm run lint
~~~

Compare search ranking/docs activation against current standalone fixtures. Browser test includes unrelated host router/title/form/shortcut behavior.

## Acceptance criteria

- Every part works independently with provider/session only.
- Search ranking/docs navigation, exact targets, settings, events, and bounded retention preserved.
- Focus ownership isolates host and neighboring providers.
- Data-only panels do not execute stories or mutate host routing/theme/title.

## Non-goals

Host router adapter, arbitrary plugin/editor commands over bridge, new search ranking, and global keyboard bindings.

## Handoff

Provide part props/exports, search data/ranking reuse, focus-scope integration, event lifecycle, and independent browser evidence. Slice 14 composes explorer and retains standalone commands through explicit adapter.

## Implementation handoff — 2026-10-02

Implemented parts live in `packages/histoire-vue/src/components/{tree,search,toolbar,events}/` as small TypeScript render components. All four public exports and iframe surface factories consume the provided session directly. They need neither explorer nor router. Tree/search emit `select` and `error`; toolbar emits `error`. Search exposes `focus()` and `search(query)`. Other part state comes from the session. Events retain named clickable details using the provider-owned dropdown and `data-test-id="event-item"` marker for standalone adoption.

Search uses existing source search projection, `convertTitleToSentence`, and Fuse `keys: ['text']` defaults, preserving title results before docs and scoped tuple targets. Native search reuses the content controller for query/revision ownership. No new search engine or SDK app dependency was added. Tree reads the completed portable tree and reports unavailable catalog separately from an empty catalog.

Toolbar updates viewport/background/direction/appearance before any runtime exists. Its editor button invokes a private finite `openInEditor` action only when advertised. Source resolves the exact collected target against current epoch/revision and rewrites to Vite's existing editor middleware. Caller cannot supply a path or URL. Static and default cross-origin books do not advertise this action.

`logEvent` now uses one shared app serializer for standalone and embeds. It preserves primitive/nested/shared values, flattens DOM events, replaces DOM nodes/windows, and bounds cyclic/deep objects. Runtime event scope captures the emitting grid cell during native dispatch. The actual event's nonzero `eventPhase` keeps ownership across browser microtask checkpoints between handlers. Non-selected grid events retain their own target while the bridge envelope remains bound to the selected runtime owner. Delayed object-only calls in a grid require explicit third-argument target; ambiguous calls are dropped. No timer or Promise monkeypatch is involved. Actual grid clicks send structured story/variant identity to session selection.

Retained iframe events use bounded batches separate from `view.sync`, with explicit reset, future-only sequence forwarding, and loss deltas. Native proxy preserves stream-owned items and dropped count across same-owner snapshot sync. Clear, owner change, unmount, and disposal stop old publications. Current-variant panel display remains compatible.

Search shortcuts attach to the provider root only. Current primary source document may relay finite search focus intent through its guarded mount port. Native wrapper focuses the owning provider's own search, skipping any nested provider. Host shortcuts, neighboring roots, and retired source documents remain untouched.

Focused evidence:

- New native navigation/runtime-event/proxy tests: 3 files, 9 tests pass. Final review regressions reproduced shared-object serialization, nested-provider focus, and ready-source/unavailable-catalog failures before fixing them; 2 files, 8 tests pass afterward.
- Full native package milestone: 13 files, 39 tests pass, including built imports with browser globals absent. Initial sandbox-only subprocess `EPERM` was rerun successfully with authorized subprocess access.
- Full SDK milestone: 12 files, 51 tests pass. Focused internal editor, event batch/loss, and mount channel tests: 3 files, 9 tests pass.
- Protocol focus direction/owner/reset validator tests pass. Core editor and existing event compatibility regressions: 3 files, 6 tests pass.
- Chromium static cross-origin/nested-base independent-parts gate passes. It proves zero story execution before explicit primary mount, two isolated sessions, docs activation, host router/title/form preservation, toolbar settings, source/provider keyboard focus, exact single/grid DOM and nested events, actual grid selection, retained iframe replay, clear, and disposal.
- Chromium dev gate passes after actual Markdown and story edits: same query loses old docs match, new docs query activates exact null-variant target, tree and result titles update after collection, and no story sandbox/browser import appears.
- Scoped source/test lint and `git diff --check` pass. Shared dependency graph build passes; final post-review artifact build and Firefox/WebKit reruns are recorded below when complete.

Final Chromium and Firefox runs pass both dev-refresh and static independent-parts scenarios. WebKit dev refresh passes; static functional assertions passed but the no-browser-error gate exposed three cross-origin accesses during FloatingVue event-detail positioning. The pinned Floating UI 1.1.1 implementation read `window.frameElement` even when reference and offset parent belonged to one document. An owned temporary artifact probe skipped that unnecessary read and passed the full static scenario; the probe was removed. A narrow source-controlled vendor build backport now skips same-document traversal and uses the [official Floating UI parent-prototype guard](https://github.com/floating-ui/floating-ui/blob/master/packages/utils/src/dom.ts) when ancestor traversal is needed. Behavioral tests cover absent getter access for local/opaque parents, allowed ancestor frames, and explicit failure if audited upstream source changes. Final rebuilt WebKit evidence remains a separate gate.

Final source-built artifact gate passes on all three engines: Chromium 2 tests in 26.69s, Firefox 2 tests in 30.92s, WebKit 2 tests in 25.85s (`/tmp/histoire-sdk12-{chromium,firefox,webkit}-guarded-final.log`). Each run includes actual dev catalog/Markdown refresh and static cross-origin panel/runtime/event interaction, with zero browser errors. Vendor/controls/native/app/core build passes (`/tmp/histoire-sdk-cross-origin-guards-build.log`). Source guard tests pass 3/3. No temporary artifact rewriting remains in tests.

Logs stay in `/tmp/histoire-sdk12-*.log`; reviewed visual artifact is `/tmp/histoire-sdk12-independent-panels.png`. These focused gates do not claim full workspace, full standalone Cypress, packed consumers, CI, or final conformance. Slice 14 owns standalone commands/router/storage integration; slices 15–16 own installed package and final matrix evidence.
