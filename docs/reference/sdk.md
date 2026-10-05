# Browser and Vue SDK reference

See [embedding guide](../guide/embedding.md) for source configuration and deployment. Public browser imports come from `@histoire/sdk`; Vue components/composables come from `@histoire/vue`. `@histoire/protocol` owns portable DTOs and typed errors. `/internal` adapter entries are unsupported for external source/story loaders.

## `createHistoireSession(options)`

```ts
import { createHistoireSession, HistoireSdkError } from '@histoire/sdk'

const session = createHistoireSession({
  url: 'https://books.example.com/stories/',
  persistenceKey: 'workspace-playground', // optional; settings only
})
await session.connect()
```

`url` is an absolute HTTP(S) book base without credentials, query, or hash. A missing trailing `/` is appended. Construction accesses no DOM. `connect()` explicitly acquires the source bridge. Persistence is disabled unless `persistenceKey` is supplied; its namespace includes normalized source URL and caller key. Storage failures retain in-memory settings.

## Session operations

| Operation | Result and runtime requirement |
| --- | --- |
| `connect()` | `Promise<void>`; explicitly connects or reconnects source |
| `getSnapshot()` | Stable read-only `HistoireSnapshot` |
| `subscribe(listener)` | Receives future coherent snapshots; returns unsubscribe |
| `catalog.list()` | Completed portable story list; no story mounting |
| `catalog.getStory(storyId)` | Exact unambiguous catalog record |
| `catalog.search(query)` | Ranked metadata/docs targets; no host router locations |
| `selection.select({ storyId, variantId? })` | Changes session target; waits for replacement runtime when mounted |
| `state.get()` | Cleaned canonical `HistoireStateSnapshot`; ready primary required |
| `state.patch(patch)` | Merges serializable edits into owning runtime; ready primary required |
| `state.reset()` | Restores initial runtime snapshot; ready primary required |
| `settings.update(patch)` | Updates session-owned viewport/theme/direction/globals |
| `events.subscribe(listener)` | Receives future attributable runtime events; returns unsubscribe |
| `events.clear()` | Clears retained history and dropped count |
| `channels.open(name)` | Configured application channel; never mounts a runtime |
| `docs.get(storyId)` | Lazy content DTO; no story mounting |
| `source.get({ storyId, variantId?, mode })` | `mode: 'raw'` is data-only; `'dynamic'` requires matching ready runtime |
| `tests.collect()` | Selected ready-preview definitions; no test execution |
| `tests.run({ mode, signal? })` | Explicit `'preview'` or `'server'` completed run summary |
| `mount(container, { surface })` | Owned handle with `id`, `ready`, `unmount()` |
| `createHiddenPreview()` | Same primary lifecycle with real viewport dimensions |
| `dispose()` | Terminal idempotent `Promise<void>` rejecting pending work and closing owned resources |

An explicit unknown story/variant rejects. Omitting `variantId` restores a remembered variant or chooses the first; docs-only stories use `null`. Explicit `null` requests story-only selection. Identity always remains `{ storyId, variantId }`.

Repeated same-target selections share pending acknowledgment and its outcome. Initial mount/reload still waits for runtime readiness. Failed or stale same-target runtime rejects with `PREVIEW_NOT_READY`; recover through explicit unmount/remount after confirmed teardown. Ready same-target selection performs no duplicate execution.

`selection.select()` waits for selected runtime in current primary. Explorer may then replace preview/grid presentation to match story layout. Before acting on replacement iframe DOM or geometry, observe its current `runtimeId` with `runtime.status === 'ready'`; operations captured for retired document reject. Selection completion does not await final Vue presentation flush.

The host mirror does not own runtime callbacks, component instances, or omitted non-serializable values. Patches and reset preserve those runtime identities. Dynamic source reports `explicit`, `slot`, or `generated` provenance. Raw source reports physical/virtual file origin. Present empty content differs from absent content.

Tests never retry or switch engine automatically. Server execution requires a dev source and advertised capability, including cross-origin opt-in. Assertion failures return `summary.ok === false`; transport/dependency/runtime/collection failures reject. Optional `execution` attribution captures one run/request identity, mode, exact target and source generation; preview results also identify runtime document. Cancellation suppresses publication immediately and observes cleanup. Preview cancellation retires sandbox and requires explicit primary remount.

## Snapshots and settings

`HistoireSnapshot` contains connection `status`, `stale`, source `{ sourceId, url, mode, epoch, revision }`, catalog, diagnostics, selection, runtime, state mirror, settings, capabilities, and bounded event history. Empty completed catalog differs from failed collection. A source epoch identifies one generation; revision identifies one completed publication.

`runtime` exposes `status`, `mountId`, `runtimeId`, `layout`, `viewports`, and selected visible `viewport`. Each visible ready entry carries structured target, content rectangle, scale, and `visibleRect` in primary mount CSS coordinates. Source/host scrolling, resize and lazy cell changes update geometry; hidden previews have no visible boxes. Do not use geometry from an older runtime document.

```ts
const stop = session.subscribe((snapshot) => {
  for (const viewport of snapshot.runtime.viewports) {
    console.log(viewport.target, viewport.visibleRect)
  }
})
stop()
```

Settings patches support:

| Field | Type |
| --- | --- |
| `responsiveWidth` | Positive finite CSS-pixel width |
| `responsiveHeight` | Positive finite CSS-pixel height or `null` |
| `rotate` | Boolean |
| `backgroundColor` | CSS color string |
| `checkerboard` | Boolean |
| `textDirection` | `'ltr'` or `'rtl'` |
| `colorScheme` | `'light'`, `'dark'`, or `'auto'` |
| `globals` | Up to 32 named scalar values: string, finite number, boolean, or `null` |

Globals updates replace that map and reach running variants reactively. Keys begin with a letter and contain up to 64 letters/digits/underscore/hyphen; strings are bounded to 1 KiB. Grid cells share session globals. Settings do not change host document theme or browser storage unless persistence was requested.

Events carry `sequence`, `timestamp`, exact `target`, `runtimeId`, and cleaned payload. Latest 1,000 events remain in `snapshot.events.items`; `droppedCount` reports retention/rate loss.

## Application channels

`embed.channels` opts into named application channels. Names match `^[a-z][a-z0-9-]{0,31}$`; configuration accepts at most 100 names. The source advertises allowed names through the `hostChannels` capability. Unlisted names reject with `CAPABILITY_UNAVAILABLE`.

`session.channels.open(name)` returns `post(type, data): Promise<void>`, `subscribe(listener): () => void`, and `getDroppedCount(): number`. Open before an explicit primary mount is supported. Posting requires a selected ready primary. Host messages reach only its selected variant; story messages can originate from any ready cell in the current grid. Subscriptions receive `{ name, type, data, runtimeId, target: { storyId, variantId } }`.

Story code imports `useHostChannel(name)` from `histoire/client` and captures its handle during framework initialization. The handle exposes `post(type, data)`, `on(type, listener)`, and `getDroppedCount()`. Listener arguments are `(data, message)`. Captured handles remain usable after `await` and retain their exact originating variant when grid selection changes. Collection and custom-controls replicas create inert handles; posting there rejects with `CAPABILITY_UNAVAILABLE`.

Payloads contain JSON only and fit a 64 KiB UTF-8 application message. Each runtime admits at most 50 messages per elapsed second per direction, shared across names and handles. Excess posts reject with `RATE_LIMITED`; inbound excess messages are dropped. Callback exceptions stay isolated. `getDroppedCount()` reports the local, saturated rate/callback loss counter, including inbound validation losses where recorded; host counters reset when the runtime retires. It is not an end-to-end delivery receipt.

Unmount, navigation, source disconnect, or runtime replacement retires channel handles and subscriptions. Open a fresh handle and subscribe again after the replacement is ready. Channels do not queue, replay, reconnect, invoke Histoire commands, or execute supplied code. A successful post acknowledges admission; application replies use application-owned message types.

## Surfaces and ownership

```ts
type HistoireSurface =
  | 'explorer' | 'preview' | 'grid' | 'tree' | 'search' | 'toolbar'
  | 'controls' | 'docs' | 'source' | 'events' | 'tests'
```

One session permits one primary preview/grid, including explorer preview and hidden preview. Competing mounts reject with `RUNTIME_IN_USE`. Await full unmount before replacement. Multiple independent data-only surfaces and multiple sessions are supported. A failed mount still belongs to caller and must be unmounted.

Runtime-dependent capabilities reflect readiness. Data-only surfaces never import story modules automatically. Custom controls execute in a source-origin replica frame and edit canonical preview state. Generic native controls patch session state.

## Vue exports

Import `@histoire/vue/style.css` once. Host Vue is a peer dependency; imports remain SSR-safe while mounting is client-only.

| Export | Purpose |
| --- | --- |
| `HistoireProvider` | Required explicit `session`; local theme, size, overlay and child ownership |
| `HistoireExplorer` | Shared composition with navigation/toolbar/preview/panels slots |
| `HistoirePreview` | Isolated single primary runtime |
| `HistoireVariantGrid` | Isolated grid primary runtime |
| `HistoireStoryTree` | Catalog navigation |
| `HistoireSearch` | Metadata/docs target search |
| `HistoireToolbar` | Session settings and capability-gated dev actions |
| `HistoireControls` | Native generic controls plus isolated custom controls |
| `HistoireDocs` | Data-only sanitized docs; optional `anchor` |
| `HistoireSource` | Explicit `mode: 'raw' | 'dynamic'`, default raw |
| `HistoireEvents` | Session event history |
| `HistoireTests` | Explicit collection, preview/server run and cancellation actions |
| `useHistoireSession()` | Nearest explicit session |
| `useHistoireSnapshot()` | Read-only shallow ref of coherent snapshots |

Explorer visibility props `showNavigation`, `showSearch`, `showToolbar`, and `showPanels` default to true. A custom preview slot owns its chosen primary component. Provider unmount closes child resources and observers, retaining caller session. Provider does not install host router, Pinia, global FloatingVue configuration, or app plugins.

Standalone automatically collects definitions once per ready source/selection/document and shares that controller with its badge and tests panel. It never automatically executes tests or retries failed collection. Independent embedded/native panels retain explicit collection; a nested provider with another session cannot inherit standalone test state.

## Standalone client commands

Existing standalone `clientAction(params, context)` receives a per-action mutable serializable projection. `context.currentVariant.state` and the selected variant under `context.currentStory` share that projection. Histoire awaits the action, then applies only explicitly edited leaf branches and complete edited arrays through `session.state.patch()`, provided the captured source, selection and runtime document still own the operation. Retired callbacks remain observed and cannot write replacement state.

The command context does not expose callable runtime callbacks or instance methods. Serializable instance-field edits preserve the actual instance in the runtime. Object property deletion throws `INVALID_ARGUMENT`; array mutations remain supported. `showIf` and `getParams` use read-only mirrors. This compatibility adapter belongs to standalone Histoire; it does not add arbitrary runtime command execution to the public SDK.

## Typed failures and compatibility

`HistoireSdkError` exposes `code`, `message`, and optional bounded serializable `details`. Common codes:

| Code | Meaning |
| --- | --- |
| `INVALID_ARGUMENT` / `RESULT_TOO_LARGE` | Invalid finite input or bounded wire/result limit exceeded |
| `NOT_CONNECTED` / `DISPOSED` | Missing active source or terminal session |
| `BOOK_UNAVAILABLE` | Source bridge cannot be reached |
| `ORIGIN_DENIED` / `PROTOCOL_MISMATCH` | Exact origin or protocol range incompatible |
| `STORY_NOT_FOUND` / `STORY_AMBIGUOUS` / `VARIANT_NOT_FOUND` | Exact identity admission failed |
| `SELECTION_REQUIRED` / `PREVIEW_NOT_READY` / `RUNTIME_IN_USE` | Selected target/ready primary/ownership missing |
| `CAPABILITY_UNAVAILABLE` | Requested engine/surface unavailable |
| `DOCS_NOT_FOUND` / `SOURCE_UNAVAILABLE` | Requested content absent |
| `STALE_REVISION` / `RUNTIME_CHANGED` | Captured source/document ownership retired |
| `COLLECTION_FAILED` / `DEPENDENCY_MISSING` / `BROWSER_REQUIRED` / `BROWSER_UNAVAILABLE` | Collection or browser execution unavailable |
| `QUEUE_FULL` | Project execution lane cannot admit more work |
| `RATE_LIMITED` | Application channel exceeded its runtime/direction budget |
| `CANCELLED` / `TIMEOUT` / `INTERNAL_ERROR` | Cancelled, deadline exceeded, or operation failed |

Protocol range negotiation is independent of package version. Initial protocol 1 has no predecessor; unsupported ranges reject with both ranges in the error. Once a predecessor exists, supported compatibility uses current/predecessor protocols and capability gating. Missing features remain typed capability errors.

Connection/control requests have a 15-second transport budget; runtime/tests retain their own longer configured deadlines. Navigation, reload, restart, unmount, or disposal invalidates affected work. Disconnect marks data stale; reconnect is explicit and does not replay state mutations or tests.
