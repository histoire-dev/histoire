# Devframe live inspection

The optional `@histoire/devframe` adapter connects an explicitly mounted Histoire session to a host-owned Devframe instance and an independently authenticated MCP endpoint. It starts no listener or connection on import. This integration exposes live observations; the existing [Histoire MCP server](./mcp.md) continues to run isolated inspection separately.

Start with the [Devframe guide](../guide/devframe.md) for installation, source configuration, complete browser pairing, and MCP client examples. Public APIs use subpath imports; there is no root export. `/client` is browser-facing; `/host`, `/node`, and `/report` require Node.js `>=22.12.0`. The Devframe peer is pinned to `1.2.2`.

## Host setup

The host must verify browser credentials and supply its own project, document, and agent authorization policy. The following uses application-owned `policy` and `devframeAuth` objects; their verification methods must not trust client-provided IDs, origins, or trust flags as proof of identity.

```ts
import { createDevframeBridge, createMcpEndpoint } from '@histoire/devframe/node'
import { initDevframe } from 'devframe/initiate'

const authorityVersion = 0
const bridge = createDevframeBridge({
  identifyPeer: session => policy.browserPrincipal(session),
  verifyAttachment: (session, identity, sourceUrl) =>
    policy.verifyDocument(session, identity, sourceUrl),
  isCurrent: (session, identity) => policy.isCurrent(session, identity),
  allowSource: url => policy.allowsBook(url),
  authorize: request => policy.allowsAgent(request),
  authorityVersion: () => authorityVersion,
})
const endpoint = createMcpEndpoint(bridge.broker, request => policy.agentPrincipal(request))

// `server` is the host's HTTP server; install routing before accepting requests.
const instance = initDevframe(bridge.definition, {
  server,
  base: '/tools/histoire/',
  origin: 'https://tools.example.com',
  allowedOrigins: ['https://host.example.com'],
  auth: devframeAuth,
  distDir: false,
  sse: false,
  mcp: false,
  register: false,
  onPeerDisconnect: (_connection, meta) => bridge.onPeerDisconnect(meta),
})
await instance.ready
```

`policy.browserPrincipal` must return a stable principal from verified transport credentials. `policy.verifyDocument` must independently verify the exact source and document identity and return `{ identity, scopes }`. `policy.isCurrent` rechecks that authority, and `policy.allowsAgent` checks discovery and each requested scope for the separately authenticated agent. `policy.agentPrincipal` verifies every MCP HTTP request and returns a stable agent principal or `undefined`. Configure `devframeAuth` to authenticate the browser transport; a browser grant does not authenticate an agent.

Route the explicit MCP path to `endpoint.fetch` (or use `toNodeHandler` from `@modelcontextprotocol/node` for Node HTTP). Route Devframe requests to `instance.nodeMiddleware`. For a cross-origin host, configure the host HTTP CORS policy to permit only the exact trusted browser origin to read the Devframe `__connection.json` metadata route, including its nested base path. Configure `allowedOrigins` for the transport separately. Deny other origins and handle the required preflight; CORS is not authentication. The host controls the public origin, HTTP server, paths and listener.

Whenever policy, source or runtime authority changes, increment the revision synchronously and invalidate affected attachments before returning control:

```ts
function authorityChanged(attachmentId?: string) {
  authorityVersion++
  bridge.invalidate(attachmentId) // omit ID to invalidate all
}
```

On shutdown, await `endpoint.close()` and `bridge.dispose()`, then close the caller-owned Devframe instance and HTTP server. Repeated disposal calls join the same cleanup. Disposal waits for peer retirement and rejects if cleanup fails or times out. Neither endpoint nor bridge owns that server. Wire `onPeerDisconnect` as above so disconnect retires the matching attachment.

### Optional host helper

`mountDevframeHost` from `@histoire/devframe/host` can create and manage the Devframe instance and bridge on a caller-owned HTTP or HTTPS server. Use it instead of the preceding `createDevframeBridge` and `initDevframe` setup:

```ts
import { mountDevframeHost } from '@histoire/devframe/host'

const host = await mountDevframeHost({
  server,
  base: '/tools/histoire/',
  origin: 'https://tools.example.com',
  allowedOrigins: ['https://host.example.com'],
  auth: devframeAuth,
  bridge: bridgeOptions, // the verified host policy callbacks described above
})
const bridge = host.bridge
// Route original request URLs through host.nodeMiddleware without stripping the base.
// Configure metadata CORS and the separately authenticated MCP endpoint as above.
await host.dispose()
```

The helper disables automatic MCP, SSE, discovery registration, and static assets. Its base must be dedicated and must not overlap another helper mount on that server. It owns only its registrations and transport; the host still owns the server, middleware installation, credentials, and origin policy. `host.dispose()` is asynchronous and joinable; remove the caller's middleware layer separately when needed.

### Host API

`mountDevframeHost(options): Promise<DevframeHost>` requires:

| Option | Contract |
| --- | --- |
| `server` | Caller-owned HTTP or HTTPS server |
| `base` | Dedicated non-root path matching `^/(?:[\w-]+/)+$`, such as `/tools/histoire/`; leading and trailing slash required |
| `origin` | Exact public HTTP(S) origin, without a path or trailing slash |
| `auth` | Custom Devframe authentication object containing `rpcFunctions`, `authorize`, and `onConnect`; boolean auth is rejected |
| `bridge` | `DevframeBridgeOptions` described below |
| `allowedOrigins?` | Additional exact origins permitted to open the transport |
| `onPeerDisconnect?` | Caller cleanup hook, invoked after the bridge disconnect hook |

The result contains `bridge`, normalized `base`, `nodeMiddleware`, and `dispose(): Promise<void>`. Install middleware without stripping the base. Mounting a duplicate, parent, or child base of another helper mount on the same server rejects; external mounts remain the caller's responsibility. Invalid bases reject with `Invalid host mount base`.

`createDevframeBridge(options)` from `/node` returns `definition`, `broker`, `getStatus()`, `invalidate(attachmentId?)`, `onPeerDisconnect(meta)`, and `dispose()`. `getStatus()` reports the bridge's attachment count. In addition to the required policy callbacks, options accept `id` (default `'histoire'`), `leaseMs` (default `15000`), and `timeoutMs` (default `5000`). A namespace matches `^[a-z][a-z0-9-]{0,63}$`; browser and server must use the same one. Timeouts must be finite and positive.

| Required callback | Contract |
| --- | --- |
| `identifyPeer(peer)` | Resolve a stable browser principal from verified transport credentials, or return `undefined` |
| `verifyAttachment(peer, identity, sourceUrl)` | Independently verify canonical source and exact document ownership; return verified `{ identity, scopes }` |
| `isCurrent(peer, identity)` | Recheck whether that document and source remain current and authorized |
| `allowSource(url)` | Permit or reject a canonical book URL |
| `authorize(request)` | Authorize `request.principal` for `request.capability`: `'discover'` or one exposure scope; request also carries `identity` and attachment metadata with browser principal |
| `authorityVersion()` | Return a host-owned monotonic revision; increment synchronously on authority changes, then invalidate affected attachments |

Identity, document verification, current-authority, and authorization callbacks may be asynchronous. `allowSource` and `authorityVersion` are synchronous. Discovery and each operation recheck authority; changing callback behavior without revision and invalidation is insufficient for timely revocation.

`createMcpEndpoint(broker, authenticate)` from `/node` returns `fetch(request): Promise<Response>` and `close(): Promise<void>`. `authenticate(request)` must verify every HTTP request and return a stable agent principal or `undefined`, synchronously or asynchronously. The endpoint owns neither broker nor server. Closing it is asynchronous and joinable; subsequent requests receive HTTP 503. Authentication failures receive HTTP 401, and endpoint saturation receives HTTP 429. The host supplies routing and HTTP Host/Origin policy.

## Pair an existing session

Enable live inspection and authorize the browser origin in the Histoire source and embedding configuration as described in [live inspection](./sdk.md#live-inspection). Once the host has authenticated the browser, it can create a short-lived, single-use grant bound to its principal, canonical book URL, and permitted scopes:

```ts
const grant = bridge.broker.createGrant({
  principal: browserPrincipal,
  sourceUrl: 'https://books.example.com/stories/',
  scopes: ['inspection', 'events'],
})
// Deliver grant.token to that browser over the host's confidential authenticated channel.
```

Do not place the token in URLs, discovery records, or logs. In the browser, use a connected session with a ready primary mount and a caller-owned authenticated Devframe client:

```ts
import { attachDevframe } from '@histoire/devframe/client'

const attachment = await attachDevframe({
  session,
  connection, // authenticated Devframe RPC client, trusted by the host
  grant: grantToken,
  projectId: 'my-project',
  scopes: ['inspection', 'events'],
})
// The caller retains ownership of session and connection.
await attachment.dispose()
```

Create the Devframe browser RPC client with `webmcp: false`; generic WebMCP registration does not provide this adapter's authenticated agent-principal and per-call authorization. The host verifies `projectId` and document identity independently. Pairing never selects or mounts a story. Granted scopes are intersected with host authorization and available SDK capabilities. Selection, source or document replacement, disconnect, revocation, or disposal retires the attachment. A new visit needs a new grant.

### Pairing API

`bridge.broker.createGrant({ principal, sourceUrl, scopes })` returns `{ token, expiresAt }`, with expiry expressed as Unix milliseconds. Grants expire after 60 seconds, are single-use, and are bound to the current host authority revision. The source must be an absolute HTTP(S) book URL without credentials, query, or fragment; a missing trailing slash is appended. The browser's source must match that canonical URL.

`attachDevframe(options)` from `/client` returns `Promise<{ attachment, dispose }>`:

| Option | Contract |
| --- | --- |
| `session` | Connected `HistoireSession` with a selected variant and ready primary mount |
| `connection` | Caller-owned authenticated `DevframeRpcClient`; await `ensureTrusted()` first |
| `grant` | Fresh token delivered through the host's confidential authenticated channel |
| `projectId` | Project claim independently verified by the host |
| `scopes?` | Nonempty, unique exposure list; defaults to `['inspection']` |
| `id?` | Same namespace as bridge `id`; defaults to `'histoire'` |

`attachment` contains `{ attachmentId, sourceUrl, owner, scopes }`, with the effective scopes accepted during pairing. `owner` contains `{ sourceId, epoch, revision, runtimeId, target: { storyId, variantId } }`. `dispose(): Promise<void>` retires only this attachment and its subscriptions, callbacks, and highlights. It is joinable and may reject if cleanup fails. The caller retains ownership of the session and connection. Pairing has a five-second client timeout; heartbeat runs every five seconds against the host's attachment lease.

## Agent services

The authenticated agent discovers authorized `histoire://live/` resources. Each call supplies the attachment ID, exact `target`, and `expectedOwner` from its resource. Scope and current authority are checked again for each operation.

| Scope | MCP tool | Purpose |
| --- | --- | --- |
| `inspection` | `histoire_inspect_session` | Bounded variant or DOM observation |
| `events` | `histoire_get_session_events` | Attributed component event history |
| `components` | `histoire_inspect_component` | Available component tree, details, or element owner |
| `accessibility` | `histoire_audit_session_accessibility` | Available bounded axe audit |
| `highlight` | `histoire_highlight_element` | Temporary selector highlight |
| `diagnostics` | `histoire_get_session_diagnostics` | Explicitly observed diagnostics |

Component and audit support depends on the source's opt-in and runtime capabilities. An automated audit does not establish full accessibility compliance. Selector highlight requires the highlight grant; component-ID highlight also requires the components grant and a supported runtime that can identify one story-root element. Diagnostic entries may contain application data; observations are document-wide and should be shared only with authorized agents. Component event history uses `eventLifetime`, sequence cursors, and loss metadata; clearing history invalidates old lifetimes. An events-only grant does not start diagnostic observation.

### Tool inputs and results

All six tools require `attachmentId`, `target`, and `expectedOwner` from the discovered attachment. Do not reconstruct an owner or reuse it after document replacement. Each tool returns successful observations as `structuredContent` plus a JSON text compatibility block. Check `isError` before consuming results. These live tools do not use the isolated MCP server's `{ ok: true, data }` success envelope.

- `histoire_inspect_session` requires `kind: 'variant' | 'dom'`; DOM reads accept `selector`, `maxNodes`, and `maxDepth`. See [SDK live inspection](./sdk.md#live-inspection) for DOM bounds.
- `histoire_inspect_component` reads a tree when both `componentId` and `selector` are omitted; tree options include `rootId`, `maxNodes`, and `maxDepth`. Supply `componentId` for exact instance details or `selector` for element owner lookup. Supplying both is invalid.
- `histoire_audit_session_accessibility` accepts optional `selector` for a bounded audit.
- `histoire_highlight_element` requires exactly one of `selector` or `componentId` and accepts `durationMs`. Component-ID highlighting requires both `highlight` and `components` authorization and the runtime's `componentHighlight` capability.
- `histoire_get_session_events` accepts `afterSequence`, `eventLifetime`, and `limit` (1–100). For the first page, omit cursor and lifetime. For subsequent pages, use returned `nextSequence` as `afterSequence` together with returned `eventLifetime`. Nonzero cursors require that lifetime. Observe `gap`, `droppedCount`, `omittedCount`, and `truncated`; loss counters describe SDK session history, including events outside the selected target.
- `histoire_get_session_diagnostics` accepts `afterSequence` and `limit` (1–100). Its results have `inspection: 'debug'`; observation starts only after diagnostics pairing is accepted and ends on retirement. Diagnostics can contain document-wide data unrelated to the selected component.

Component, accessibility, and highlight tools do **not** accept a caller-supplied `kind`; the service chooses its operation. The adapter exposes no generic script execution, state mutation, selection, or mounting tool. Highlight is an explicitly authorized temporary action.

## Detached reports

`@histoire/devframe/report` is a Node-only export for selected variant or DOM results, including live and isolated observations. It returns historical JSON data and standalone HTML without writing a file or opening a connection. Pass detached inspection results, such as a successful live tool's `structuredContent`, rather than its entire MCP response:

```ts
import { createInspectionReport } from '@histoire/devframe/report'

const { data, html } = createInspectionReport({ results: [variant, dom] })
```

The default report contains summaries and hashed identity values, not state or DOM content. Content requires explicit selections and a caller-provided sanitizer; sanitized data can still be sensitive. Reports accept at most 32 results and have bounded output. They are historical observations, not live sessions.

To include selected content, supply result indexes and explicit field/node selections. Here `sanitizeForSharing` is your application's sanitizer; there is no built-in guarantee that arbitrary application data is safe to share:

```ts
const selected = createInspectionReport({
  results: [variant, dom],
  content: {
    selections: [
      { index: 0, stateKeys: ['count'] },
      { index: 1, nodeIndexes: [dom.nodes[0].index] },
    ],
    sanitize: (value, context) => sanitizeForSharing(value, context),
  },
})
```

This example requires variant state to contain `count` and DOM results to contain at least one node; select only fields and nodes actually returned. Each result may have one selection. Sanitizers receive detached JSON and `{ resultIndex, kind: 'state' | 'dom', key }`; DOM sanitizers must return text. Exported DOM content includes selected node text and bounded structural identity, excluding attributes, selectors, and URLs. Each selected value is bounded to 16 KiB, aggregate selected content to 48 KiB, and each final JSON/HTML output to 64 KiB. Oversized or unsupported results reject rather than silently expanding the report.

## Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| MCP HTTP 401 | Verify independent agent credentials and `authenticate` callback on every request; browser trust and pairing grants do not authenticate an agent |
| Empty resources or tools | Check active pairing, granted scopes, current host policy, and agent authorization for discovery and operations |
| Tool error `SESSION_UNAVAILABLE` / `Live session unavailable` | Check exact owner, current runtime, scope, and authorization. After retirement, wait for intended runtime, obtain fresh grant, re-pair, and rediscover resource |
| Event error `STALE_REVISION` / `Event history lifetime unavailable` | History lifetime changed or nonzero cursor lacks lifetime; restart pagination without old cursor/lifetime and retain newly returned values |
| Browser error `Live capability unavailable` | Check source inspection flags, optional dependencies, framework support, and `session.getSnapshot().inspection`; requested scopes must include an available capability |
| Pairing error `Live session unavailable` | Verify connected source, selected variant, ready primary mount, and authenticated connection after `ensureTrusted()` |
| Pairing timeout or rejected grant | Check transport and host verification; ensure grant is fresh, unredeemed, bound to same principal, canonical source, and current authority revision |
| Cross-origin metadata fetch fails | Allow exact browser origin on nested `__connection.json` route, handle preflight, and configure transport `allowedOrigins` separately |
| Disposal rejects | Observe and report incomplete cleanup; still release other caller-owned resources using `finally` or `Promise.allSettled` |

Recovery is explicit. Reconnection does not revive retired attachments or replay operations.
