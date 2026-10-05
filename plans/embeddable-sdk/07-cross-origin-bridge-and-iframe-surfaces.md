# 07 — Cross-origin bridge and iframe surfaces

## Outcome and prerequisites

Depends on: 05, 06.

Connect and mount through exact-origin handshake, dedicated MessagePorts, and scoped ownership. [public-api.md](public-api.md) is authoritative for protocol, identities, finite commands, deadlines, and lifecycle. This slice builds common transport; later slices implement individual views.

## Owned files

- Add packages/histoire-sdk/src/transport/{handshake,port,requests,validation,connection}.ts and src/mounts/{iframe,handle}.ts.
- Add packages/histoire-app/src/embed/{handshake,commands,view-session,lifecycle,surfaces}.ts.
- Extend protocol validators only for agreed contract gaps; do not create parallel message definitions.
- Add SDK transport/request tests and core browser integration bridge-origins.spec.ts, bridge-lifecycle.spec.ts.
- Add separate core test:embed:integration script/config now, consuming shared browser/process fixtures; browser suite must not enter default unit test include.

## Tests first

1. Real source/host ports give distinct origins. Same-origin and explicitly allowed cross-origin connect/read behave identically.
2. Reject unlisted/null/wildcard/credential/path origins, wrong event.source, mismatched hint/version/nonce, missing/extra transferred ports, and unsolicited acknowledgment.
3. Send malformed/unknown commands, forged IDs, duplicate request replies, and traffic from unrelated frame/old port.
4. Dispose during connection, unmount before ready, navigate same iframe to new document, and restart source with pending requests. No late update/retry/unhandled rejection.
5. Verify unsupported view rejects capability instead of empty iframe resolving ready; data-only view never mounts story.
6. Timeout connect/control operations using shared clock. Runtime/test budgets remain distinct and observe eventual completion.
7. Hostile story (H11): fixture story code reaches into its same-origin surface wrapper and posts forged events, oversized payloads (> 64 KiB), event floods (> 200/s), and responses for other requests. Parent drops or bounds them per [trust boundary](public-api.md#trust-boundary), counts drops, and never calls host listeners with unvalidated data.
8. Cross-origin parent requesting openInEditor or server-mode tests gets CAPABILITY_UNAVAILABLE unless `embed.allowOpenInEditor` / `embed.allowServerTests` is set; same-origin standalone unaffected.
9. Third-party iframe with storage blocked (Chromium third-party storage blocking and WebKit default) connects, mounts, and applies colorScheme/settings from the bridge (H12).
10. Protocol negotiation (H24, [public-api](public-api.md#common-identities-and-data)): a host supporting protocol 1–2 connects to a book speaking 1 (negotiates 1, capability-gated features stay off) and fails against a book speaking 3 with `PROTOCOL_MISMATCH` naming both ranges.
11. Wire limits: valid catalog response above 1 MiB but below 8 MiB reaches controller; cyclic/aliased state survives state.get and state.changed; malformed/deep/wide/oversized payload rejects or drops per shared contract. Correctly correlated oversize rejects pending request promptly with RESULT_TOO_LARGE; no timeout, truncation, or retry. Test catalog.changed/view.sync and state/layout event-specific limits.

## Implementation steps

1. Resolve source URL against configured base without reading host location at factory import. Create bridge iframe only in explicit connect().
2. Perform exact target-origin hello after load. Child validates actual parent frame/origin against configured allowlist and bootstrap hints, then negotiates connection identity on transferred port.
3. Bind port to source generation/session/mount identity. Validate every finite command payload and response before dispatch; transport error DTO bounded and reconstructed as SDK error.
4. Source bridge imports data adapters only. Surface view uses parent-backed session proxy: it receives parent selection/settings/state and sends commands through own port, not independent global selection controller.
5. Build reusable mount lifecycle with handle.ready and async idempotent unmount. Reserve primary before iframe creation; errors retain cleanup handle and observed promise.
6. Mount each surface through own port/identity. Initially advertise only implemented views; register later preview/panels centrally, without separate bootstrap per view.
7. Parent coordinates requests/subscriptions across ports with captured epoch/revision/mount/runtime/target. Wrong/stale replies cannot settle replacement work.
8. Mark inactive before navigation/teardown; reject affected pending operations, remove event listeners/timers, close ports, remove owned elements.
9. Apply 15-second connection/control budget; delegate runtime/test budget selection to shared contract. Never replay state writes/test runs after reconnect.
10. Enforce parent-side trust boundary in one inbound gate per port: bound command/stream identity, shared bounded schema/size traversal, per-port event rate, then dispatch. Reuse protocol accounting on outbound requests too; specific catalog/state/layout limits override generic limits. Reject oversized correlated responses and mark dropped lifecycle data stale. Gate cross-origin openInEditor/server tests behind config flags at child dispatch and in advertised capabilities.
11. Keep same-origin sandbox checks unchanged. External parent talks only to Histoire wrapper, never direct story/custom-controls window.

## API changes

Implement remote connect/mount/dispose backed by MessagePorts. Capability availability is incremental. Public surface union stays stable; unavailable implementation rejects typed error until its slice lands. No arbitrary plugin sendEvent, JavaScript execution, filesystem read, or bearer-token tunnel.

## Failure paths

Origin/version denial, wrong frame/port, protocol corruption, source unavailable, timeout, reload, and disposal fail explicitly. Disconnect marks stale; reconnect requires caller action. A valid port does not authorize requests for another session/mount/document.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/sdk test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test:embed:integration bridge-origins bridge-lifecycle
pnpm run lint
~~~

Script accepts suite filters as defined by new integration config. Record actual distinct origin URLs and browser used.

## Acceptance criteria

- Actual cross-origin allow/deny and exact frame/version/port binding proven.
- Per-mount/request ownership, malformed traffic, deadlines, stale navigation, and disposal covered.
- Data bridge and independent data-only surfaces do not execute stories.
- No wildcard/referrer trust, direct cross-origin sandbox relaxation, or automatic replay.
- Large valid catalogs and cyclic state survive parent gate; oversized/hostile graphs cannot hang traversal or leave pending requests silently unresolved.

## Non-goals

Authentication system, arbitrary third-party transports/loaders, individual panel implementation, custom-controls overlay geometry, and SSR mounting.

## Handoff

Give command registry, source proxy adapter, mount registration seam, error/deadline handling, and browser fixtures to slices 08–13. Preserve unsupported capability state until each view passes its own gate.
