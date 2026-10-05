# Public API and ownership contracts

Authoritative v1 application contract. Every slice references this file. External bridge is Histoire application protocol, independent of MCP protocol. Additive changes require compatibility tests; incompatible bridge/descriptor changes increment version.

## Common identities and data

- protocolVersion and descriptorVersion start at 1.
- Version negotiation (factory H24, review S7): the hello message carries the host's supported `{ min, max }` protocolVersion range; the child answers with the highest common version, or fails with `PROTOCOL_MISMATCH` naming both ranges. The descriptor declares its own version. Initial release implements protocol 1; no predecessor book exists. Once protocol N ships with a predecessor, host SDK supports N and N-1 for at least six months. Features are gated by capabilities, never by version sniffing.
- sourceId is opaque stable book identity; never absolute path. Dev epoch changes on project restart; static epoch derives from immutable build identity. Static surface documents read same baked descriptor.
- revision is opaque completed-source revision, compatible with shared Node snapshot identity. Never infer freshness from title equality or iframe load.
- sessionId, connectionId, mountId, runtimeId, and requestId are distinct scoped opaque values. Plain HTTP development supported; do not require crypto.randomUUID without supported fallback.
- Target identity is { storyId, variantId }. Preserve existing IDs byte-for-byte. Store nested maps or injective tuple encoding; never split colon-concatenated IDs.
- Portable catalog exposes exact story/variant IDs, title, group/tree path, icons, docsOnly/layout, supportPluginId, relative file label, content availability, diagnostics, and capabilities. Tree leaves name storyId rather than unstable array index.
- Catalog exposes explicitly projected metadata only. No absolute paths, Context, plugin hooks, component constructors, Vite module IDs, loader functions, or arbitrary runtime objects.
- Capabilities carry { available, reason? } and distinguish data support, mounted runtime readiness, preview tests, server tests, dynamic source, and open-in-editor.

## Browser factory and lifecycle

~~~ts
/** Constructs browser session without accessing window/document or connecting. */
export function createHistoireSession(options: HistoireSessionOptions): HistoireSession

/** Remote book URL and optional preference namespace. */
export interface HistoireSessionOptions {
  /** Absolute HTTP(S) book base URL, ending at configured book base. */
  url: string
  /** Opt-in persistence namespace; absent means memory-only preferences. */
  persistenceKey?: string
}

/** Selection input; explicit null retains story selection without variant. */
export interface HistoireSelectionInput {
  /** Existing collected story ID. */
  storyId: string
  /** Omitted uses SDK default; null leaves variant unselected. */
  variantId?: string | null
}

/** Independently mounted UI surface. */
export type HistoireSurface =
  | 'explorer' | 'preview' | 'grid' | 'tree' | 'search' | 'toolbar'
  | 'controls' | 'docs' | 'source' | 'events' | 'tests'

/** Resource handle; caller owns removal even when ready rejects. */
export interface HistoireMount {
  /** Unique identity for this attachment. */
  id: string
  /** Resolves after view readiness, including runtime when surface owns one. */
  ready: Promise<void>
  /** Idempotently tears down owned work, ports, and elements. */
  unmount: () => Promise<void>
}
~~~

Factory validates/normalizes URL without DOM and imports safely in SSR/Node. connect() explicitly requires browser and creates data bridge. Repeated connect shares in-flight connection; after disconnect, explicit reconnect establishes fresh connection with no mutation/test replay.

Statuses: idle, connecting, ready, restarting, disconnected, failed, disposed. Source connection ready differs from preview readiness, exposed separately in snapshot. dispose() is asynchronous/idempotent/terminal; mark inactive before awaits, reject pending operations immediately, then close owned resources.

getSnapshot() returns stable, recursively read-only observation through shared `HistoireReadonly<T>` type. SDK and Node subscribe callbacks and native useHistoireSnapshot expose the same nested readonly contract, including arrays, state, settings, catalog and runtime fields. Portable wire DTOs remain mutable for message construction; readonly observations do not permit mutation of session internals. subscribe(listener) registers without implicit execution and returns disposer; consumers obtain initial value via getSnapshot(). Publish coherent snapshots rather than half-updated selection/readiness/state.

### Snapshot and result field ownership

Use these field names consistently in protocol DTOs, SDK, and first-party views:

- HistoireSnapshot.status uses lifecycle statuses above; stale indicates retained source data after disconnect/failure.
- source is null before handshake, otherwise { sourceId, url, mode: 'dev' | 'static', epoch, revision }. URL is normalized book base.
- catalog holds latest completed portable catalog/tree; diagnostics contains projected source collection diagnostics.
- selection is null or { storyId, variantId: string | null }. Remembered choices are private session state.
- runtime contains status absent/mounting/ready/failed/stale, mountId, runtimeId, layout single/grid, viewports, and viewport. viewports contains target-attributed geometry for ready visible variant content boxes; viewport is the selected variant's entry or null. Identity fields null until allocated; readiness never inferred from state mirror presence. See runtime geometry below (H17).
- state is null until authoritative snapshot exists, otherwise HistoireStateSnapshot with { target, runtimeId, value }. Host reads value only; runtime supplies full state privately.
- settings uses named fields in settings contract below; capabilities carries named operation availability plus per-surface availability.
- events contains items and droppedCount. Each event carries sequence, timestamp, structured target, runtimeId, and cleaned payload; clear does not reuse live request identity.

Capability keys: catalog, search, docs, rawSource, dynamicSource, state, customControls, previewTests, serverTests, openInEditor; surfaces maps each HistoireSurface to availability. Source capabilities describe supported engine; effective session capabilities also require selected target and runtime readiness. Unavailable entry includes typed reason, not guessed fallback.

HistoireSearchResult contains target, kind story/variant/docs, title, rank, and optional excerpt/anchor. Anchor is panel-local navigation data; it never becomes host document query. Content DTOs include storyId, optional variantId, epoch/revision, origin, relative label, format, and text/html body as appropriate. No arbitrary fetch URL provided by caller.

Preserve existing wire-safe test-definition/run-summary fields and attach captured target/runtime identity at adapter boundary. Do not rename test status/failure fields merely for SDK. Snapshots are read-only projections; do not freeze live runtime objects or caller session.

### Runtime geometry

HistoireViewport contains { target: { storyId, variantId }, x, y, width, height, scale, visibleRect: { x, y, width, height } }. Coordinates are CSS pixels relative to primary mount container's padding box, with scroll offset accounted for; width/height are complete rendered content-box dimensions. scale is positive rendered-to-logical viewport scale. visibleRect is the content box intersected with source scroll clips, mount viewport, host ancestor scroll clips, and host viewport in the same coordinates. Source reports inner geometry; parent SDK/native mount adapter composes host clipping without reading cross-origin child DOM.

Single preview publishes one entry when ready and visible. Grid publishes one entry per ready visible variant content box; entries identify cells, not outer iframe containing the whole grid. Lazy/unmounted/fully clipped variants have no entry. viewport aliases selected entry and is null when no selected visible ready variant; other visible grid entries remain available without selecting them. Hidden preview has no visible entries.

layout.changed carries { viewports } as full replacement plus normal mount/runtime/source identity. Publish on ready, selection, source/grid scroll, host scroll affecting visibility, container/cell resize, responsive width/height/rotate change, and lazy-cell mount/unmount. Map inner content and clip rectangles through sandbox/surface frame offsets/scales into mount coordinates. Use observer/listener cleanup and animation-frame coalescing; stale documents cannot publish. Provider/native wrapper accounts for its local mount position without changing remote target identity.

## Browser session methods

- catalog.list(): Promise<readonly HistoireCatalogStory[]> returns completed catalog; no story mounting.
- catalog.getStory(storyId): Promise<HistoireCatalogStory> validates exact lookup; ambiguous/unknown IDs fail.
- catalog.search(query): Promise<readonly HistoireSearchResult[]> returns targets and rank, preserving existing title/docs ranking. Optional standalone commands are separate first-party adapter, not remote plugin execution.
- selection.select(input): Promise<void> validates catalog first, changes one selected target, and awaits new runtime readiness when primary exists. Repeated same-target callers share pending acknowledgment and its failure; they cannot bypass readiness or composition barriers. Same-target selection during initial mount or reload waits captured runtime readiness. Failed/stale/quarantined same-target runtime rejects with `PREVIEW_NOT_READY`; recovery requires explicit remount after confirmed teardown, without automatic transport retry. Ready same-target selection resolves without duplicate execution. Without primary, changes metadata selection only. Explorer may subsequently replace preview/grid presentation after that acknowledgment; observe current replacement runtimeId and ready status before using its DOM/geometry. Operations captured for retired documents reject. Selection does not await final Vue presentation flush.
- state.get(): Promise<HistoireStateSnapshot> requests authoritative selected runtime snapshot.
- state.patch(patch): Promise<void> applies serializable selected-target patch; resolves on correlated runtime acknowledgment/snapshot.
- state.reset(): Promise<void> restores initial serializable baseline captured at first actual mount for current runtime/variant, retaining callbacks/local identities.
- settings.update(patch): Promise<void> updates session preferences and forwards to active runtime; may run without preview.
- events.subscribe(listener): () => void receives future attributable events. events.clear(): void resets retained session history and dropped count.
- docs.get(storyId): Promise<HistoireDocsContent> reads content and origin/format/revision without story import.
- source.get({ storyId, variantId?, mode: 'raw' | 'dynamic' }): Promise<HistoireSourceContent>. Raw needs no runtime. Dynamic requires matching active runtime; omitted variant uses selected variant only if story matches.
- tests.collect(): Promise<HistoireTestCollectionResult> collects selected ready preview variant.
- tests.run({ mode: 'preview' | 'server', signal? }): Promise<HistoireTestRunSummary> runs captured selected variant through explicit engine. Collection/transport failures reject; failed assertions resolve summary.

Dynamic source preserves runtime precedence: explicit source, source slot, then support-plugin generation. It reports corresponding `explicit`, `slot`, or `generated` provenance. Unavailable dynamic output rejects with `SOURCE_UNAVAILABLE`; generator/slot failure rejects with `INTERNAL_ERROR`, and missing matching ready runtime rejects with `PREVIEW_NOT_READY`. Dynamic mode never substitutes raw file text. Legacy standalone copy action retains its existing raw fallback through the compatibility helper.

Collection and run results may include additive `execution: HistoireTestExecutionIdentity` with `runId`, explicit `mode`, structured `target`, and published `sourceId`/`epoch`/`revision`; preview results also include `runtimeId`. SDK engine ports bind `runId` to existing initiating bridge request, and view proxies preserve that attribution. Node runs reuse existing runner identity, may omit `target` for multi-story runs, and retain published source generation when available. Identity has one finite portable validator; no callbacks or private paths enter results.
- mount(container, { surface }): HistoireMount creates owned surface and reserves primary slot synchronously when applicable.
- createHiddenPreview(): HistoireMount explicitly creates offscreen primary preview in session's browser document.
- connect(): Promise<void> and dispose(): Promise<void> own source connection lifecycle.

State get/patch/reset, custom controls, dynamic source, collect, and preview-mode tests require primary runtime. Server-mode tests require selected variant plus advertised dev server engine; no preview needed. Missing readiness never silently mounts stories.

## Selection, primary runtime, and state

At most one primary mount per session. Explorer, preview, grid, and hidden preview reserve same slot. Second claim throws RUNTIME_IN_USE before creating resource. Release only after teardown; multiple independent sessions supported.

Primary readiness requires that exact mount still owns the slot. A closing handle cannot publish readiness while asynchronous teardown retains its slot. Selecting docs/null retires the current runtime document and pending readiness, without failing the retained native wrapper; its next owned document can become ready normally. Initial iframe handshake readiness captures source, selection and document identity, so its late rejection cannot fail an empty selection or replacement runtime.

Omitted variant restores still-valid remembered choice, otherwise first catalog variant. Explicit invalid variant fails with VARIANT_NOT_FOUND and preserves previous selection. Explicit null leaves variant unselected. Docs-only stories accept omitted/null but reject concrete variant. Empty variant lists never create fabricated selection.

Standalone URL adapter deliberately uses explicit null for unseen multi-variant story, preserving existing chooser. It still auto-selects sole variant and restores prior valid selection.

Docs story links use shared portable route parser. Bare `?variantId` means explicit null; omitted variant keeps default-selection behavior. Dot-only story IDs use `?storyId=..` instead of path normalization. Standalone adapter carries requested `tab` and anchor into its owned history/hash URL, including links that clear a previous variant. Native docs select through provided session and resolve anchors within their panel without changing host URL. This uses finite first-party navigation delegate; public SDK has no host-router dependency.

Hidden preview is caller-requested, positioned offscreen with real viewport, never display:none. Width starts at session responsiveWidth (existing default 720); height uses configured responsiveHeight or 560. Caller awaits ready before runtime operations.

Runtime owns full live state. Wire contains existing cleaned plain serializable projection; preserve cycles currently supported by structured-clone bridge. Functions, prototypes, instances, Maps, and DOM identity cannot transfer. Ref unwrapping occurs in Vue runtime adapter, not protocol dependency.

Native generic JSON controls expose a field-local read-only unavailable state for values JSON cannot round-trip, including cycles and BigInt. SDK state retains those values unchanged; sibling controls and automatic-prop Reset remain usable. Native control action buttons default to `type="button"`; explicit caller `type="submit"` remains supported by the shared button component.

Reuse applySerializedState and existing state guards. Plain-object patch merges fields; arrays follow existing serialized reconciliation, including omitted callbacks. Derived _hPropDefs cannot be overwritten by caller. Existing _hPropState automatic prop overrides remain supported. No new generic property-delete operation in v1.

Initial runtime snapshot wins over host boot skeleton. Replay explicitly captured user edits after readiness, never full uninitialized host mirror. Reset applies baseline projection through same reconciliation, rather than replacing runtime root.

Retain last 1,000 attributable events with droppedCount. Clear/unmount/selection behavior preserves existing current-variant Events panel semantics. Preferences memory-only unless persistenceKey supplied; namespace by normalized source URL and key. Storage failures fall back to memory.

Runtime `logEvent(name, argument, target?)` cleans DOM values, nested payloads, and cycles once. DOM events and synchronous native handlers resolve exact emitting content cell, including non-selected grid variants. Single-cell delayed callbacks remain attributable. Delayed object-only calls in a multi-cell grid require explicit `{ storyId, variantId }` third argument; uncaptured ambiguous actors are dropped instead of assigned to current selection. Parent validates source/document and collected target before publishing. Retained event batches use bounded `events.appended` publications with optional `reset` for initial replay, clear, or owner replacement; `view.sync` carries loss count separately. Native events use provider-owned local dropdowns and current-variant display.

Native search shortcuts listen inside provider root only. Owned preview documents relay finite `focus.changed` search intent over current primary port; native preview wrapper focuses owning provider search. Retired documents and other providers cannot claim that focus. Standalone plugin commands remain standalone adapter responsibilities.

Standalone command availability follows canonical session state, selection, capabilities and metadata through an owned reactive subscription. Rendered rows and keyboard actions share one command publication. Visibility changes preserve a surviving highlighted command by ID; removing that command retires its keyboard intent until an explicit arrow/focus choice. Hidden rows cannot activate through retained DOM callbacks. Closing the command adapter releases subscriptions once.

Standalone command search matches case-insensitive label or existing `searchText`. Successful docs search activates owning provider's Docs panel and scoped anchor after selection acknowledgment, including mixed stories with `variantId: null`. Source/target replacement or child disposal retires pending activation. Native/iframe explorers preserve host URL/title; standalone adapts docs activation through its existing router. Standalone encodes explicit null selection as bare `?variantId`; omitted variant parameter keeps legacy remembered-variant/chooser resolution in both history and hash modes. Independent Search emits result without requiring Explorer; caller panel slots and visibility remain authoritative.

## Settings, content, and Vue

Settings reuse current responsiveWidth/responsiveHeight/rotate/backgroundColor/checkerboard/textDirection fields and add explicit colorScheme light/dark/auto plus globals. Validate finite positive viewport sizes, null optional height, enum values, and string background. Theme/appearance applies to provider and preview, not host document. Move the wire-safe settings type from histoire-app `PreviewSettings` into protocol once (slice 01).

globals is a host-owned JSON-safe map delivered to the running story without remount: at most 32 keys matching `^[A-Za-z][\w-]{0,63}$`, values string (≤ 1 KiB), finite number, boolean, or null. Story code reads it reactively through `useHistoireGlobals()` from histoire/client; framework setup handlers receive the current value. Default globals come from config `preview.globals`. Typical use: design-token or theme overrides per preview (H15).

`useHistoireGlobals()` returns Vue reactive map. Svelte templates use `const globals = useHistoireGlobalsStore()` from histoire/client and `$globals.token`; vanilla code calls this store's `subscribe(listener)` returning unsubscribe. Store is separate from map so `subscribe` remains valid host data key. Only map values cross bridge. Runtime callbacks never enter wire types or JSON serialization.

Embedded surface and sandbox documents take settings, including colorScheme, only from the bridge. They never read or write browser storage or cookies for settings; storage denial or partitioning in a third-party iframe cannot change appearance (H12, H16). Standalone keeps existing storage-backed preferences.

Docs DTO distinguishes html, text, absent, and empty content, and includes origin sibling/standalone/inline/collected. Source DTO distinguishes raw file/virtual text from dynamic output. Both carry captured revision and relative label. Resolve unavailable content with explicit errors, not successful empty strings.

Native remote HTML is sanitized using DOMPurify HTML profile after URL resolution; forbid script/style/iframe/object/embed and style/event attributes. Preserve safe Markdown/code/link attributes. Link activation delegates structured target to session; anchors stay panel-local. Standalone trusted-local adapter keeps existing HTML policy. Custom rendering slots receive data but do not disable default sanitizer.

Export HistoireProvider, HistoireExplorer, HistoirePreview, HistoireVariantGrid, HistoireStoryTree, HistoireSearch, HistoireToolbar, HistoireControls, HistoireDocs, HistoireSource, HistoireEvents, HistoireTests, useHistoireSession, useHistoireSnapshot.

Provider requires session prop, supplies root/overlay ownership, and never disposes caller session. Missing provider throws clear error. Child resources unmount on disposal. Ordinary components use selection from session. Source accepts raw/dynamic mode; Tests exposes explicit preview/server actions. Preview/Grid reserve primary on mount.

Explorer slots: navigation, toolbar, preview, panels. Visibility props: showNavigation, showSearch, showToolbar, showPanels, all true by default. Default preview reserves primary; caller preview slot assumes responsibility for its chosen preview component. Host owns CSS import, size, session connect/dispose, URL/title, and external router.

## Source documents and cross-origin transport

embed.enabled defaults false; allowedOrigins defaults empty. When enabled, current source origin is automatically allowed. Validate explicit additional HTTP(S) origins including port; reject path/query/hash, wildcard, opaque/null, or credentials. No inherited parent trust from document.referrer.

Deploy-time override (H9): built books keep the baked list unless the deployer supplies one without rebuilding. Node target reads `HISTOIRE_EMBED_ORIGINS` (comma-separated). Static books fetch optional same-base `histoire-embed-origins.json` (`{ "version": 1, "allowedOrigins": [] }`, requested with `cache: 'no-store'`) before handshake; when present it replaces the baked list. Same validation; an invalid or unreadable present override fails closed to the book origin only.

Framing (H10): when embed is enabled, dev middleware/managed server and Node server send `Content-Security-Policy: frame-ancestors 'self' <effective allowed origins>` on index, __embed.html, and __sandbox.html responses, including error responses. Static output documents the equivalent header. Disabled embed leaves current headers unchanged.

### Trust boundary

The book origin is one trust domain. Story code is same-origin with surface and bridge wrappers and can forge any child-side message, so the parent treats every inbound event and response as untrusted data (H11):

- Validate schema and identity before use, applying command-specific limits and cycle-safe accounting below. Drop over-rate events (more than 200 per second per port) and count them in droppedCount.
- Never evaluate received content, forward host credentials, or let received data choose host URLs.
- Cross-origin ports never serve openInEditor or server-mode tests unless config `embed.allowOpenInEditor` / `embed.allowServerTests` is true (both default false). Same-origin standalone keeps current behavior.
- Histoire builds no URL carrying credentials or tokens; hints in surface URLs are non-secret. Book subresource requests stay relative and same-origin, so gated books work with `SameSite=None; Secure; Partitioned` cookies and never require them.

### Wire size and traversal limits

Limits apply to payload/result, with separately validated envelope metadata capped at 64 KiB. Choose limit from validated command/stream and captured port role, never caller-supplied size/class hint. Specific limits replace generic limit; they are not cumulative conflicting caps:

- Default event payload: 64 KiB. state.changed and layout.changed: 1 MiB. channel.message/channel.post retain stricter slice-17 64 KiB limit.
- Default request payload or successful response result: 1 MiB. Catalog/descriptor responses, catalog.changed, and handshake descriptor payload: 8 MiB, overriding default response/event limit.
- view.sync projected snapshot: 8 MiB; its catalog field also satisfies catalog JSON bound and its state field satisfies 1 MiB state-graph bound. Send retained event history as bounded batches rather than embedding unbounded history in view.sync.
- Error DTO: 16 KiB including details. No body truncation or successful empty replacement to satisfy limit.

Protocol owns one iterative sizing/validation helper, reused before posting and at every inbound gate. Catalog/descriptor/content/error/channel DTOs remain JSON-safe: count exact UTF-8 JSON bytes incrementally, including escaped keys/strings, without building an unbounded JSON string. Repeated acyclic references are charged on each JSON occurrence; cycles in these DTOs are INVALID_ARGUMENT.

State and view snapshots may contain cleaned structured-clone cycles/aliases and existing undefined/BigInt primitives. Do not JSON.stringify them. Count 16 bytes once per distinct object/array, 8 bytes per property/reference edge, UTF-8 bytes for keys/strings, 8 per number, 1 per boolean/null/undefined, and 8 plus magnitude bytes per BigInt; charge every reference edge but traverse each container once using visited identity. Bound BigInt magnitude against remaining budget before producing a bounded representation for exact counting. The bound check must not allocate a budget-sized BigInt sentinel; small valid values must work in Chromium, Firefox and WebKit with the same signed byte boundaries. JSON mode rejects undefined/BigInt; state mode preserves these existing cloneable values and sparse slots. This is portable accounting budget, not claimed browser-native serialization size.

Both modes stop at first exceeded bound: depth 128, 100,000 containers, 200,000 property/reference edges, and applicable byte limit. Array length counts toward edge budget even for sparse holes. Traversal never invokes accessors/toJSON and rejects accessors, prototype-mutating keys, unsupported values, or non-finite numbers. Count strings with early cutoff rather than allocating an oversized encoded buffer.

Locally oversized requests and correctly correlated oversized responses reject RESULT_TOO_LARGE; malformed shape rejects INVALID_ARGUMENT. Oversized/rate-limited events are dropped and counted; losing catalog/state/layout publication marks corresponding snapshot stale. Parent rejects affected pending work rather than waiting for successful empty data. Wrong-owner traffic cannot settle another request. All failure paths observe abandoned work and never replay mutations/tests.

Source writes/serves __embed.html and histoire-embed.json at configured base. Descriptor includes version, source identity/generation/revision, portable config/theme/presets, catalog/tree, content/search references, and implemented capabilities. Heavy bodies separate/lazy. Legacy output remains compatible.

Source bridge URL uses view=bridge. Surface URL uses view=surface&surface=<supported name>. SDK provides parentOrigin/sessionId/mountId as non-secret bootstrap hints. Hints alone never authorize messages.

Handshake: parent sends hello to exact source origin after iframe load with session/mount/version/nonce and transferred port. Child requires event.source === window.parent, event.origin equal validated parentOrigin and allowed origin, matching hints/version, and exactly one port. Ack includes descriptor identity and negotiated connectionId over bound port. Data bridge makes no story import.

Each mount gets separate bound port. Every message uses protocolVersion/sessionId/connectionId/mountId/sourceId/epoch/revision; requests/responses additionally use requestId. Runtime-targeted traffic includes runtimeId and structured target. Validate command-specific payload before dispatch. Port identity supplies negotiated origin trust; arbitrary global message cannot enter port handler.

Internal outer bridge identity also carries optional `selectionVersion`, a nonnegative safe integer. Parent advances this generation when its accepted target changes and sends it with `view.sync`/`selection.select`; child adopts that generation and captures it in UI selection intent. Once established, missing or older generations cannot dispatch child selection, including after A–B–A navigation returns to the same structured target. State/settings synchronization of an unchanged target does not advance selection generation. Responses retain their captured predecessor identity. This field does not enter public `HistoireSnapshot` or create a second preview protocol; existing sandbox selection generation continues guarding inner runtime traffic.

Parent-to-child `view.sync` requests may additionally carry `selectionRequestId`, naming the exact child selection request whose synchronous parent-controller publication caused this synchronization. Only that pending intent survives its accepted selection echo, including story-only or docs-only normalization; unrelated host navigation rejects superseded intents even when its target matches their requested target. This request-only field is validated as a bounded wire ID and forbidden on other commands, child requests, handshakes, events, and replies. Dispatch scope ends before asynchronous work resumes, so later host changes cannot inherit the acknowledgment.

Repeated synchronization of the same accepted generation keeps an accepted intent pending until its captured acknowledgment; only a subsequent target-generation transition supersedes it. Readiness with an explicit target must match the accepted target even when no runtime document is named. Targetless absence can clear runtime ownership while preserving selection; old-target absence cannot rewind selection or block replacement readiness.

Catalog/content/disconnect publications are source-owned: validate exact protocol/session/connection/mount/source/epoch identity, finite payload and sequence independently of the selected runtime/target. A source publication queued before host navigation still advances the mounted port's revision. Parent-only `view.sync` can catch the child up using a forward captured selection generation after an earlier snapshot failed revision admission; derive the resulting generation from the parent's predecessor target and snapshot selection, without incrementing twice. Older generations, malformed ownership and stale child intent remain rejected. Presentation synchronization cannot retry state mutations or test execution.

Generation belongs to each port. Nested Explorer recaptures inner connection, mount, and generation while retaining initiating source/runtime/target and outer reply ownership. Native/standalone local adapters synchronously advance both locally owned endpoints before direct runtime snapshot observers run; queued `MessageChannel` synchronization alone cannot provide that ordering. This first-party in-process authority path validates matching session/source/epoch/mount and structured target, preserves exact active child-selection cause, and owns its subscription cleanup. It adds no wire command or public session method.

Failed, stale, and absent readiness retire current runtime document even when the publication retains its ID. Retired documents cannot dispatch child intent or regain authority through late readiness. Explicit parent selection may still create a replacement runtime, and mount ownership remains reserved until confirmed teardown.

Runtime retirement does not retire the source. Finite source/presentation requests (`catalog.*`, `docs.get`, raw `source.get`, `settings.update`, `events.clear`, subscriptions, `openInEditor`, `controls.configure`, and server `tests.run`) remain available through their existing capabilities and exact source/port/target guards. Pending requests capture this scope at admission. Runtime-owned state, dynamic source, preview tests, presets, channels, and child selection remain retired. Catalog/content/disconnect publications can still replace or retire the source. An absent-runtime publication clears `runtimeId` in both payload and envelope; it cannot inherit the previous document ID.

Finite commands mirror supported method groups only. No generic sendEvent, arbitrary plugin dispatch, URL/path requests, or JavaScript input. Lifecycle subscriptions include catalog/content revision, selected/runtime state, events, settings, and readiness. Outer overlay messages preserve opaque option IDs and originating scope.

### Wire registry and dispatch

Envelope kind is request, response, or event. Request adds command and payload. Response echoes captured identity and requestId with either ok: true/result or ok: false/error. Event adds event name and payload, with monotonically increasing sequence per bound port. Unknown command/event, invalid discriminant, or mismatched owner cannot enter handler.

Wire payloads use these shapes so adapters share one validator registry: catalog.changed carries `{ descriptor }`; content.changed carries `{ storyIds }`; selection.changed carries `{ target }`; state.changed carries HistoireStateSnapshot directly; settings.changed carries validated settings patch; events.appended carries `{ items, droppedCount?, reset? }`; readiness.changed carries `{ runtime }`; layout.changed carries `{ viewports }`; source.disconnected carries `{ reason? }` with typed error data. tests.progress carries `{ runId, status: 'collecting' | 'running' | 'completed' | 'cancelled' | 'failed', completed?, total?, summary?, error? }`. Overlay events carry existing opaque `id` plus `anchor`/`overlay` or result fields; controls.height carries `{ height, hasControls? }`; focus.changed carries `{ focused, direction?: 'next' | 'previous', action?: 'search' }` (directions are controls-only, search is owned primary presentation intent); channel.message carries `{ name, type, data, runtimeId, target }`, where payload target identifies the originating grid actor while envelope target identifies current selection.

Successful response validation uses command captured by pending request, never a child-supplied command hint. Void acknowledgments encode `result: null`; state.patch/state.reset may return authoritative HistoireStateSnapshot or null, while state.get must return snapshot. view.sync carries HistoireSnapshot directly with bounded event batches sent separately. Both result and event DTO shapes are validated before observers receive them.

For preview/grid mounts, view.sync projects catalog metadata to every match for the selected story ID, retaining all sibling variants and diagnostics, with an empty navigation tree. Empty selection produces no story entries; docs-only selection retains its documentation entry without creating a runtime. Keeping all duplicate matches preserves ambiguous-ID rejection. Each mount caches only its current catalog reference and selected story ID; a new catalog publication or story selection replaces that projection. Host getSnapshot/catalog APIs and all other surfaces retain the complete catalog. This reduces state-update serialization without introducing another DTO, protocol command, or serializer.

catalog.changed/content.changed may advance revision on the same captured sourceId/epoch/connection/mount after schema and monotonic per-port sequence validation. Catalog descriptor identity must match event envelope sourceId/epoch/revision. Other requests, responses and runtime events require captured revision equality. Publication cannot change source/epoch/port ownership; stale documents never regain authority by naming a new revision.

Finite application request names: catalog.list, catalog.getStory, catalog.search, selection.select, state.get, state.patch, state.reset, settings.update, events.clear, docs.get, source.get, tests.collect, tests.run, tests.cancel, controls.configure, controls.preset, openInEditor, subscriptions.add, subscriptions.remove, channel.post, view.sync. Use exact public payloads for method-equivalent commands; openInEditor accepts collected target only. subscriptions uses validated stream names plus opaque subscriptionId. channel.post carries `{ name, type, data }` for the selected ready primary. view.sync carries projected view snapshot, never runtime callbacks.

Internal tests.cancel carries `{ requestId }` and retires only a test request admitted on the same bound port and captured owner. Active server execution survives runtime retirement; its cancellation is validated against that exact active request's captured owner, including runtime, target and selection generation. This exception cannot admit unrelated cancellation or new runtime work. Cancellation rejects caller publication immediately; execution cleanup still owns lane release. Internal controls.configure carries `{ customOnly: boolean }`, parent-to-child on controls ports only. Native controls select custom-only replica presentation while standalone iframe controls retain generic editors. Configuration changes presentation only and cannot create runtime ownership or execute code.

Internal controls.preset accepts one finite action: `{ action: 'list' }`, `{ action: 'save', label }`, `{ action: 'apply' | 'delete', id }`, or `{ action: 'rename', id, label }`. Responses contain at most 1,000 opaque IDs and labels, with optional active ID; state values, callbacks, instances, and cycles stay in primary runtime. Labels contain 1–120 characters after trimming. Presets belong to captured runtime document and structured story/variant target; custom controls request intent through parent session. Embedded presets remain in memory; standalone adapter owns migration and persistence of compatible serializable preferences.

Finite event names: catalog.changed, content.changed, selection.changed, state.changed, settings.changed, events.appended, readiness.changed, layout.changed, tests.progress, source.disconnected, overlay.open, overlay.update, overlay.close, overlay.result, controls.height, focus.changed. Slice 17 adds capability-gated channel.post request and channel.message event (see Host channels). Overlay/focus fields reuse existing controls contracts with scoped identity, not arbitrary selector/callback/action input.

Dispatch is role-aware: data bridge serves catalog/content/search and advertised dev server tests; primary surface serves matching runtime state/dynamic source/preview tests; custom-controls surface serves replica/overlay traffic. Surface UI sends method intent to parent controller, which validates selection/ownership before forwarding to appropriate source/runtime. view.sync is parent-to-view only. A valid data port cannot issue primary-runtime commands or mutate another mount.

Selection replacement authority is directional: parent-to-child selection may replace captured target, while child-to-parent UI intent must still match current parent target/runtime. Embedded sandbox grid intents also carry document-owned `selectionVersion`; wrapper rejects delayed intents after any newer selection, including a change back to the same target. Already selected cells emit no selection intent. Legacy same-origin host messages may omit this optional field; new embed wrappers require it without weakening frame/origin/document guards.

Existing same-origin `STATE_SYNC` traffic adds optional `controlsRevision` for custom-controls replicas. Each controls document increments a nonnegative safe-integer counter before publishing a local edit; its wrapper admits only increasing revisions and echoes its admitted revision with canonical state. Controls apply an acknowledgment only when its revision equals their current local counter, preventing an older acknowledgment from overwriting an edit still in transit. Replacement documents reset their counter and remain subject to existing frame/origin/document/target guards. Missing revisions retain legacy compatibility; invalid or replayed present revisions cannot mutate state. This field does not create a second state owner or an outer bridge command.

Validator registry is shared protocol code. Reject prototype-mutating state keys and non-cloneable input; permit already supported cleaned cyclic state on MessagePort, while descriptor/catalog/error DTOs remain JSON-safe. Validate origin/version/identity before payload dispatch, and enum/target/size/value shape before execution. Typed validation failure is INVALID_ARGUMENT; untrusted wrong-owner traffic is dropped/port closed without affecting active replacement.

Connection/control-request timeout 15,000ms. Preview mount/readiness uses existing storyCollectTimeout (default 30,000ms). Preview test transport uses source runTimeout plus 15,000ms margin; server test transport uses existing 360,000ms default or configured run budget plus transport margin, whichever larger. Per-test/hook deadlines remain embedded lifecycle's responsibility.

On navigation/reload/restart/unmount/dispose: mark captured owner inactive, reject affected requests, remove listeners/timers, close ports, observe abandoned promises. Do not accept old same-story document readiness. Disconnect never triggers mutation/test retry.

## Errors

HistoireSdkError extends Error with code and optional bounded serializable details. Portable error definition lives in protocol; SDK and Node entry re-export same definition without importing browser controller. Codes: INVALID_ARGUMENT, RESULT_TOO_LARGE, BROWSER_REQUIRED, NOT_CONNECTED, DISPOSED, CAPABILITY_UNAVAILABLE, PROTOCOL_MISMATCH, ORIGIN_DENIED, BOOK_UNAVAILABLE, STORY_NOT_FOUND, STORY_AMBIGUOUS, VARIANT_NOT_FOUND, SELECTION_REQUIRED, PREVIEW_NOT_READY, RUNTIME_IN_USE, STALE_REVISION, RUNTIME_CHANGED, DOCS_NOT_FOUND, SOURCE_UNAVAILABLE, COLLECTION_FAILED, QUEUE_FULL, RATE_LIMITED, DEPENDENCY_MISSING, BROWSER_UNAVAILABLE, CANCELLED, TIMEOUT, INTERNAL_ERROR.

BOOK_UNAVAILABLE means the remote book/source connection cannot be reached. SOURCE_UNAVAILABLE means raw or dynamic story source is unavailable, the same meaning as the MCP code of that name. DEPENDENCY_MISSING means a required project dependency is absent; BROWSER_UNAVAILABLE means the installed browser automation dependency cannot launch its required browser executable. Shared codes keep one meaning across SDK and MCP.

Return bounded transport error data; reconstruct typed errors in client. Do not leak Node absolute paths, config hooks, raw exceptions, or MCP credentials. Underlying story/test content is user project data, not promised secret detection.

## Node SDK

createHistoireProject({ root, configFile? }): Promise<HistoireProject> resolves explicit root/config and constructs idle controller. Root required; configFile relative to root. Construction does not start listener, launch browser, or install dependencies.

Project methods:

- startDev({ host?, port?, open? }): Promise<HistoireServerHandle>. Managed server defaults to current dev configuration; return handle after acquisition/listen, with ready promise for completed initial collection.
- createMiddleware({ httpServer, base, publicOrigin }): Promise<HistoireMiddlewareHandle>. HTTP/HTTPS HTTP/1 host server required; base is normalized absolute path with trailing slash; publicOrigin is explicit HTTP(S) origin. Returned middleware delegates full original URL under base.
- build({ outDir? }): Promise<HistoireBuildResult> uses fresh build capture and preserves current target/default configuration, including Node target when MCP work lands. Relative override resolves against project root.
- preview({ host?, port? }): Promise<HistoirePreviewHandle> serves configured built public output with owned listener, immutable built-target lookup, and private nonce capture-host registry on same origin. ready awaits output validation and listening; legacy books without capture metadata remain browsable but capture is CAPABILITY_UNAVAILABLE. Does not substitute development Vite for deployed Node server.
- runTests({ storyId?, variantId?, signal? }): Promise<HistoireTestRunSummary> uses existing project runner, captured context, and shared execution service. variantId requires storyId. Browser client limits this operation to captured selected variant.
- captureScreenshot({ storyId, variantId, width?, height?, deviceScaleFactor?, colorScheme?, textDirection?, globals?, signal? }): Promise<HistoireCaptureResult> renders one variant through shared browser host and execution lane against active preview() capture source when present, otherwise active dev source; chosen source must be ready, with no fallback after capture begins. No active source yields CAPABILITY_UNAVAILABLE. Result { png: Uint8Array, mimeType: 'image/png', width, height, sha256 }; input width/height are CSS viewport pixels (320–3840 by 240–2160), deviceScaleFactor integer 1–3 (default 1), and result width/height are decoded PNG pixels (input dimensions multiplied by deviceScaleFactor, up to 11520 by 6480). PNG remains capped at 4 MiB; valid dimensions do not waive byte bound. Oversize is RESULT_TOO_LARGE. Determinism defaults: animations/transitions off, reduced motion, caret hidden, timezone UTC, locale en-US, fonts ready plus two frames (H3, H4). Later: captureScreenshots(targets, options) reuses one browser with a fresh context per target (H5).
- getSnapshot(), subscribe(listener), close(): Promise<void>.

Development test/capture admission requires a completed catalog with `updating === false`; retained metadata remains readable during collection. Queue-head validation rechecks captured runtime, catalog identity, and updating state before acquisition. Capture also discards completion if that ownership changes during execution. Admission fails `CAPABILITY_UNAVAILABLE`; invalidated queued/in-flight ownership fails `RUNTIME_CHANGED` rather than running retained targets.

Unconfirmed cleanup permanently quarantines the project execution lane, including canonical `HISTOIRE_RUNTIME_CLEANUP_FAILED` markers and nested aggregate causes. Queued work is cancelled, future execution is unavailable, and scoped/project `close()` retains the cleanup failure after the original operation settles. Later no-op cleanup or late settlement cannot restore lane availability.

### Built preview capture ownership

Slice 03 defines a reader/projection for immutable built metadata, and slice 04 owns preview routing. Static builds extend existing histoire.json compatibly with optional capture metadata { schemaVersion: 1, buildId, base, defaultColorScheme, backgroundColor, textDirection, globals }. Stories/variants come from existing serialized catalog; no absolute paths, callbacks, raw source, or credentials in capture metadata. Emit for new static builds regardless of embed.enabled. buildId hashes canonical metadata excluding buildId plus emitted asset hashes, avoiding self-referential file hashes.

Node-target preview uses validated private manifest/catalog internally and serves public/ only; no private file becomes HTTP asset. Neither reader collects/imports live stories or requires an enabled embed descriptor. Older static outputs lacking capture metadata serve normally with capture unavailable.

Each preview handle owns validated build snapshot, unique epoch, actual bound origin/base, capture-host registry, and execution ownership. Serve exact active nonce routes under <base>__histoire/preview/ before sirv/history fallback. Expired/unknown nonce returns 404, never index.html. Captures retain snapshot/epoch/target at admission. Preview restart invalidates old work/leases before validating new output; close invalidates immediately, cancels/drains captures, then closes registry/listener. Owned build cannot replace active preview output; close preview before rebuilding same outDir.

Server handle: ready, restart(), close(). Middleware handle adds middleware. Project permits one active dev hosting handle and one active preview handle, which may coexist; second handle of either kind fails RUNTIME_IN_USE before acquisition. Distinct Vue/Svelte project roots/controllers coexist in one process; Nuxt keeps one active project per process as specified by slice 02. Concurrent Nuxt roots use separate processes. Duplicate active bases on same HTTP server reject. Builds do not mutate live dev metadata; concurrent builds targeting same outDir are serialized/rejected rather than deleting another output.

Middleware close never closes caller HTTP server; unregister only exact Histoire-owned upgrades/listeners/connections. Stable delegator survives restart and calls next outside base. During restart, owned path returns explicit unavailable response rather than stale runtime. Host closes its own server separately.

Library never changes process cwd/environment, installs packages, adds process signal handlers, or calls process.exit. CLI owns signal/exit/log presentation and defaults root from launch cwd. Preserve two-Vite-server creation order and plugin hooks.

## Host channels (slice 17, implementation in progress)

Optional capability hostChannels lets story runtime code and the embedding host exchange application messages without Histoire interpreting them (H18). Config `embed.channels: string[]` opts in named channels (`^[a-z][a-z0-9-]{0,31}$`); unlisted names are rejected on both sides. Story side: `useHostChannel(name)` from histoire/client with `post(type, data)` and `on(type, listener)`. Host side: `session.channels.open(name)` with `post(type, data)` and `subscribe(listener)`. Payloads are JSON only, ≤ 64 KiB serialized, ≤ 50 messages per second per direction and runtime; each message carries runtimeId and structured target and is dropped after runtime change. Host-to-story messages target the primary runtime only. Channels never dispatch Histoire commands, plugin events, URLs, or code. Trust boundary rules apply unchanged.

Both handles expose `getDroppedCount()` for saturated local rate/admission/callback loss; this counter is not a delivery acknowledgment. Host counters reset when their runtime retires. A successful `post()` acknowledges admission only. Collection/controls handles stay inert and cannot post. Capture story handles during framework initialization; later asynchronous callbacks retain exact variant ownership. A host handle may open before the first explicit mount, but retirement prevents that handle from binding to any replacement document, even if it never posted. Open and subscribe again after replacement. Limits apply across names/handles, configuration accepts at most 100 names, and excess posts reject with `RATE_LIMITED`.

## Internal adapter and deployment boundaries

@histoire/sdk/internal exposes controller/source/frame construction only for first-party adapters. External host-owned registries/loaders are not supported public v1 API.

Static source served by Node deployment remains browser static source; server-tests capability stays false through embed bridge. Deployed MCP may separately expose built-preview execution with its own authentication/capabilities. No browser SDK bearer forwarding to MCP, and no credentials in embed descriptor.

Node artifact public embed files use MCP roadmap's public/ layout. Private catalog/source manifests never become browser resources. MCP public/private source policy and includeSource behavior remain separate from legacy public Source panel assets.
