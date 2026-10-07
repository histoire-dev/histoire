# Authoritative contracts

All APIs below are proposed. Preserve existing exports and behavior. Concrete upstream Devframe types/import paths must be checked in slice 01; Histoire semantics in this document remain authoritative.

## Identity and availability

Live results include `mode: 'live'`, `owner`, `observedAt` (UTC ISO timestamp), `durationMs`, and `truncated`. `owner` contains `sourceId`, `epoch`, `revision`, `runtimeId`, and exact `{ storyId, variantId }`. Runtime IDs never survive document replacement. Session routing additionally uses broker-issued `sessionId` and `attachmentId`; these are identifiers, never authorization.

SDK methods accept optional `target` and `expectedOwner`; omitted target captures current selected variant synchronously. An explicit target may address a ready rendered grid cell in current primary without changing selection. No implicit mount/scroll/render of virtualized cells. Unrendered target returns `PREVIEW_NOT_READY`. `expectedOwner` mismatch returns `RUNTIME_CHANGED`, or `STALE_REVISION` for changed source publication. Validate owner before execution and after all awaits. Explicit non-selected targets must not be invalidated merely because sibling selection changes; they must be invalidated if their own cell retires. Extend request ownership narrowly rather than weakening existing guards.

Source descriptors gain optional top-level `inspection` with capability objects for `variant`, `dom`, `components`, `componentDetails`, `highlight`, `diagnostics`, and `accessibilityAudit`. Absence means unavailable, including old sources. Source-level capability is an upper bound; SDK intersects it with current runtime/framework availability. Individual unavailable capabilities include existing typed reason codes. Do not add `capabilities.inspection`: current version-1 readers reject unknown capability keys. Keep existing capability maps unchanged; expose effective inspection availability through a separately typed optional snapshot extension after checking its wire path.

New config `inspection` defaults disabled for live instrumentation. `inspection: { enabled: true, diagnostics?: boolean, components?: boolean, accessibility?: boolean, allowedOrigins?: string[] }` enables generic variant/DOM/highlight; optional features default false. Existing isolated MCP inspection is unaffected. Cross-origin inspection requires exact origin in both existing embed allowlist and `inspection.allowedOrigins`; the latter defaults empty. Same-origin inspection still requires enablement. Use existing origin parsing/validation; reject wildcards and opaque origins. Project live exposure to agents is a separate explicit adapter opt-in.

Project inspection origins into optional top-level `inspectionPolicy: { allowedOrigins: string[] }` for dev and static source descriptors. Do not add fields inside existing strict `embed` or `config` objects. Enforce source-owned policy at dispatch as well as capability projection; caller-provided descriptors never grant permission. Absence of policy denies cross-origin inspection. Validate both new top-level extensions strictly in new readers.

Keep protocol/descriptor version 1 only if old-reader/new-descriptor tests prove additive optional fields survive discovery, handshake, descriptor updates, and snapshot transport. Current source validator permits unknown top-level descriptor fields, but that alone does not establish end-to-end compatibility. Otherwise negotiate a compatible range and version the descriptor before publishing; never silently break old books. No new command is sent without its capability. Test compatibility using frozen baseline reader fixtures rather than the newly modified validator on both sides.

## Browser SDK

```ts
// Signatures abbreviated here; implementation adds JSDoc to every member.
type InspectionOptions = {
  target?: { storyId: string; variantId: string }
  expectedOwner?: HistoireInspectionOwner
  correlationId?: string
  signal?: AbortSignal
}

session.inspect.variant(options?: InspectionOptions)
session.inspect.dom(options?: InspectionOptions & {
  selector?: string; maxNodes?: number; maxDepth?: number
})
session.inspect.components(options?: InspectionOptions & {
  rootId?: string; maxNodes?: number; maxDepth?: number
})
session.inspect.component(options: InspectionOptions & { componentId: string })
session.inspect.accessibility(options?: InspectionOptions & { selector?: string })
session.inspect.highlight(options: InspectionOptions & {
  selector?: string; componentId?: string; durationMs?: number
})
session.debug.getSnapshot(options?: { afterSequence?: number; limit?: number })
session.debug.subscribe(listener)
session.debug.clear()
```

`correlationId` is optional opaque trace metadata (maximum 128 characters), never authority or a deduplication key. Broker supplies it for agent-originated calls; SDK request entries then join to Node MCP activity without inventing console causality. Runtime commands still use internally generated request IDs. Read methods return `Promise<HistoireReadonly<result>>`; highlight returns `Promise<HistoireReadonly<{ owner, observedAt }>>` after ring installation, not after its duration elapses.

Exactly one selector/component ID required for highlight. Default duration 1500 ms, maximum 5000 ms. It draws a runtime-owned non-interactive ring without changing selection/focus/state. Ring closes on cancellation, expiry, cell retirement, or owner disposal. Component ID is opaque and document-scoped. Component-specific calls added only after slice 09; accessibility after slice 10.

All returned results and listener data use `HistoireReadonly<T>` recursively. Construction/import attaches no observers and accesses no DOM. Inspection reads are bounded and return promises; `AbortSignal` is local API input, not serialized. Read timeout 5000 ms; accessibility scan timeout 10000 ms. Cancellation stops cooperative work and suppresses late publication; it never means synchronous traversal can be preempted mid-instruction.

Finite bridge additions: `inspection.variant`, `.dom`, `.components`, `.component`, `.accessibility`, `.highlight`, `.cancel`; `debug.subscribe`, `.unsubscribe`; event `debug.entries`. Cancel references an exact request owned by same port, target, and runtime. These commands are unavailable on data-only and controls ports. View surfaces route through owning session/primary. Reuse envelope, origin, size, and error validators.

## DTOs and budgets

- Variant: current bounded `state`, automatic `components` prop metadata, `propsAvailable`, `omittedValues`; distinguish automatic prop rows from new component-tree nodes.
- DOM: current `matched`, node/parent indices, allowlisted attributes, direct text, rect, and selected styles. Browser and isolated modes share projection.
- Component tree: `{ nodes: [{ id, parentId, name, framework, source? }], omittedCount }`. Maximum 500 nodes/default 200, depth maximum 20/default 8. Details return selected node, projected props, opt-in available setup/data state, and associated element selectors. Unsupported values omitted with counts. Never call computed getters to populate details.
- Source: `{ relativePath, line?, column? }` only when registered/contained in project. No raw absolute paths, arbitrary open-file input, or assumed source mappings.
- Audit: `{ matched, engine: 'axe-core', engineVersion, violations, incomplete, passesCount, inapplicableCount, droppedCount }`; rules include ID, impact, help URL, and bounded nodes with selectors/failure text. No raw HTML by default. Audit means automated findings, not accessibility compliance.
- Common result limit 60 KiB UTF-8, including identity and metadata; schema hard ceiling 64 KiB. Reserve metadata bytes before traversing. Return explicit truncation rather than slicing invalid JSON.
- Preserve state bounds: depth 10, 2000 visited values, 100 array items, 4096 characters/string; automatic prop metadata budget 20 KiB. DOM selector maximum 512 characters; existing node/depth/attribute policies retained. Invalid CSS maps to new portable `INVALID_SELECTOR` (existing MCP retains its code).
- Live concurrency: maximum four outstanding reads per session; fifth returns `QUEUE_FULL`; one audit at a time per runtime returns `RUNTIME_IN_USE` on overlap. No silent queue or automatic retry. Shared synchronous traversal remains bounded by node/work counts.

## Debugging contract

Debug entry: `{ sequence, timestamp, monotonicTimeMs, kind, owner?, requestId?, operationId?, correlationId?, outcome?, message?, details? }`. Session kinds cover SDK request start/end, state patch summary, component event, runtime lifecycle, console, and page error. Node MCP activity remains in its existing observer and joins by correlation ID; never inject a server clock into a browser monotonic sequence. Owner absent only for source/session lifecycle entries before a runtime exists. Unknown causality remains absent; do not invent a parent correlation for unrelated browser console messages.

Retain at most 1000 entries and 1 MiB per session, whichever comes first; maximum 50 incoming runtime entries/second and 4 KiB/entry. Single response page defaults 100, maximum 200 and 60 KiB. Report `droppedCount`, `oldestSequence`, `nextSequence`, and `gap` when requested cursor predates retained history. `clear()` retains monotonic sequence, advances oldest cursor, resets retained history and loss count. Subscribers receive future batches only; subscriber exceptions isolated. Runtime replacement retires its observers; session history retains attributed prior entries until clear/dispose. No replayed callbacks after reconnect.

`getSnapshot()` synchronously returns readonly local page; `clear()` synchronously clears local retained history. `subscribe(listener)` returns `{ ready: Promise<void>, unsubscribe: () => Promise<void> }`: reserve handle before async bridge registration, reject `ready` for unavailable/denied/not-ready runtime, and join cleanup idempotently. Subscription captures one runtime observation lifetime; replacement closes observation and requires explicit new subscription. Local SDK trace capture is enabled while an observation or authorized adapter diagnostics consumer exists. A plain events scope does not enable console instrumentation. Broker holds one diagnostics observation per attachment when explicitly granted, and reports observation loss instead of silently returning a current-looking empty history.

Diagnostics activation is reference-counted per document. Attach console wrappers only during authorized observation, preserve original behavior, restore only owned wrappers, and collect bounded strings without invoking arbitrary object getters/formatters. No request/response bodies, headers, raw console argument objects, or full stacks by default. Browser live diagnostics do not claim CDP/network coverage.

## Node SDK

Add `project.inspect.variant/dom/accessibility/diagnostics(options)`; existing Playwright ARIA gets explicit `project.inspect.aria(options)` so it cannot be confused with axe. Each requires `source: 'dev' | 'preview'`, `storyId`, `variantId`; optional `expectedRevision`, `signal`, and current screenshot settings. Dev/built source is explicit, never auto-fallback. Defaults for new isolated inspection match existing MCP inspection (1280×800, DPR 1); existing screenshot API defaults remain unchanged.

Return completed readonly isolated result with `mode: 'isolated'`, source identity, target, observed time, and existing content. No operation IDs or MCP resources on public Node results. Acquire correct source-owned execution lane; check source/target again on admission and completion. `close()`/restart cancels and joins cleanup. Failed cleanup quarantines lane. Existing MCP adapter projects shared result into unchanged legacy shape and retained operation resources.

## Optional Devframe attachment

```ts
// Proposed public adapter surface.
import { attachHistoireDevframe } from '@histoire/devframe/client'

const attachment = await attachHistoireDevframe({
  session,
  connection, // already connected, caller-owned Devframe RPC client
  grant,      // one-use pairing grant delivered by host bootstrap
  expose: ['inspection', 'events'],
  webmcp: false,
})
await attachment.dispose()
```

Exposure vocabulary: `inspection`, `events`, `diagnostics`, `highlight`, `components`, `accessibility`. No state mutation, test execution, filesystem, or arbitrary SDK method exposure in live v1. Effective scopes are intersection of requested scopes, source capability, grant scopes, and server authorization. `events` reads existing attributed component event history; `diagnostics` reads new debug timeline. Read-only attachment never registers highlight actions.

Attachment owns registrations/subscriptions only. Closing it leaves session and connection usable. Closing session invalidates attachment synchronously. Reconnect creates fresh attachment/grant; no queued action flush. Adapter publishes bounded discovery summaries, not entire `HistoireSnapshot` or canonical mutable state. Generic Devframe shared state must not become a second state authority.

Attachment handle exposes `getSnapshot()`, `subscribe(listener): () => void`, and `dispose(): Promise<void>`. Snapshot contains `status: 'connecting' | 'ready' | 'disconnected' | 'disposed'`, broker identities when assigned, effective scopes, source/current owner, and WebMCP availability; no grant/credential. Summary publication is authenticated broker RPC, not globally readable Devframe shared state. Per-principal discovery uses authorized query results. Browser RPC, inspector invocation, resources, and MCP all enforce the same authorization; disabling shared-state MCP projection alone does not protect a browser RPC connection.

## Node adapter and pairing

`createHistoireDevframe({ project, liveSessions: { identifyPeer, authorize } })` from `@histoire/devframe/node` returns `{ definition, createSessionGrant, dispose }`. Creation does not listen, launch browsers, or close supplied project. Host mounts definition using tested Devframe handler/kit APIs. Live sessions disabled if `liveSessions` omitted. `identifyPeer(peer)` is mandatory when live sessions are enabled and maps verified transport credentials to a host principal; returning undefined or throwing denies registration. Define a narrow adapter peer view in slice 01 after checking actual upstream connection metadata. Peer IDs establish connection ownership, not user identity. Never accept a principal from registration JSON. `authorize({ principal, session, capability })` is mandatory when enabled, evaluated for listing and every invocation; throwing denies. MCP HTTP requests separately resolve verified request credentials to the same principal namespace; browser pairing credentials are not agent credentials.

`createSessionGrant({ sourceUrl, scopes, principal })` is in-process host API, never agent tool or public unauthenticated route. It returns high-entropy one-use secret, expires after 60 seconds, and binds exact canonical source URL, permitted principal and scopes. Host delivers it through authenticated bootstrap in memory/response body, never URL/log/resource. No server-side fetch of caller source URL. Redeem only on authenticated Devframe connection; bind opaque attachment/session IDs to that connection. Catalog claims remain observations from authorized host, not cryptographic proof of story behavior.

Registry heartbeat every 5 seconds, expiry after 15 seconds; socket close invalidates immediately. Default cap 32 attachments per project; excess rejects before subscription. Source generation change revokes registration; same-source runtime changes refresh registry summary and invalidate affected captured calls. Selection changes invalidate selection-bound calls only; explicitly targeted surviving grid cells retain their own owner. A heartbeat arriving after expiry cannot revive a registration, even if the expiry timer has not run yet. Pairing grant secrets are never persisted to report/instance registry. Project close invalidates registrations; adapter disposal does not close project. Reserve closing promise before notifying observers.

## Live MCP tools and resources

New endpoint tools:

| Name | Input beyond session identity | Result |
| --- | --- | --- |
| `histoire_list_sessions` | Optional cursor/pageSize (default 20, max 50) | Authorized attachment summaries, capabilities, source/current runtime, nextCursor |
| `histoire_inspect_session` | `kind: 'variant' | 'dom'`, target, expectedOwner, DOM bounds | Live result |
| `histoire_get_session_events` | afterSequence, limit | Existing component event page with loss information |
| `histoire_get_session_diagnostics` | afterSequence, limit | Debug timeline page |
| `histoire_inspect_component` | target, expectedOwner, optional componentId, tree bounds | Tree when ID absent; details when present |
| `histoire_audit_session_accessibility` | target, expectedOwner, optional selector | Axe report |
| `histoire_highlight_element` | target, expectedOwner, selector or componentId, durationMs | Completion acknowledgment for owning runtime |

Except listing, require `sessionId` and `attachmentId`; rendered calls require explicit target and expectedOwner. Discovery supplies current selected owner. For another mounted grid cell, obtain its exact owner through SDK inspection and forward it unchanged; do not synthesize a cell runtime ID from selected owner. Broker compares publication and attachment lifetime, then SDK/runtime validates requested cell owner. A selected-owner comparison must not reject a distinct valid rendered cell. Unknown arguments rejected. Tools return Histoire `{ ok, data/error }` envelopes; adapter-level failures normalize to stable Histoire errors where representable. Read tools are bounded direct replies; no existing operation handle fabrication. Audit timeout/cancellation suppresses late output. Highlight is action, not a read; no automatic retry, and no mutation replay on transport reconnect.

Use finite stable tool list for enabled adapter features; per-session availability is data, not dynamic tool generation per component. Do not promise list-change/resource subscriptions over stateless HTTP. Preserve polling fallback. Expose read-only per-session summary resources with URIs returned by discovery. URI construction/parser must use shared encoding helpers and include attachment lifetime; reads repeat authorization. No raw generic shared-state exposure: set `exposeSharedState: false` and feature-test every hosting entry point.

List cursor pins an authorized registry snapshot for 30 seconds and includes principal/filter identity; expiry returns `CURSOR_EXPIRED`. No raw token/URL/path inside cursors. Paginate by both item count and complete serialized response bytes; reserve envelope/cursor bytes and never skip an item because the current page is full. Bound individual summaries before registration so one record cannot make every listing page fail. Add portable `SESSION_NOT_FOUND`, `SESSION_DISCONNECTED`, `PERMISSION_DENIED`, `CURSOR_EXPIRED`, and `INVALID_SELECTOR`; retain existing errors otherwise. Unauthorized sessions use `SESSION_NOT_FOUND` to avoid enumeration; capability denial on visible session uses `PERMISSION_DENIED`.

Devframe discovery locates endpoint/project only. Exact browser session remains explicit tool input. WebMCP delegates same descriptors to local attachment after feature detection and same scope checks; unsupported browser has no tools and does not affect ordinary SDK operation.
