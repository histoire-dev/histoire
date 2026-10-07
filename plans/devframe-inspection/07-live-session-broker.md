# 07 — Authorized live-session broker

## Outcome and prerequisites

Depends on: 06. Route exact requests to paired live attachments and isolate projects/principals/tabs.

## Owned files

- New `packages/histoire-devframe/src/node/{index,definition}.ts` and `src/node/sessions/{registry,grants,authorization,dispatch,heartbeat,cursors}.ts`.
- Shared adapter registration DTOs; focused broker unit and real two-browser integration tests.
- Node public project used through `histoire/node`; no controller-context import from package internals.

## Tests first

1. Two tabs with identical story/runtime labels and two projects route to selected attachment only. Agent call never broadcasts execution.
2. One-use, expired, wrong-source, wrong-principal, and replayed grants reject without registry entry. Duplicate redemption race admits once.
3. Unauthorized listing/resource/call/debug access does not reveal hidden session; authorization rechecked after asynchronous lookup and before dispatch.
4. Socket close, missed heartbeats, project close, grant withdrawal, source epoch change, or disposal invalidates pending calls and removes resources.
5. Runtime changes between discovery and invocation reject expectedOwner. Event from retired connection cannot refresh successor lease. Late heartbeat cannot revive an expired lease before timer callback. Selecting a sibling cannot cancel an explicitly targeted surviving cell.
6. Limits/cursor principal binding, authorization changes during pagination, and reentrant close behave as contracts specify.

## Implementation steps

1. Implement in-memory registry per adapter/project. Generate independent random session/attachment IDs, cap entries, and bind them to verified connection identity. Resolve principal through mandatory host `identifyPeer`; undefined/throwing resolver denies before grant redemption. A trusted socket or numeric peer ID alone does not identify an authorized user.
2. Implement host-only grant creation and atomic redemption, retaining only hash/necessary grant metadata until expiry. No secret in snapshot/trace/error.
3. Bind source URL to configured project dev/built URL or explicitly authorized static book URL through host policy; normalize with SDK URL rules. Do not trust claimed project/source IDs as authorization and do not fetch submitted URLs.
4. Use actual upstream targeted-client primitive verified in 01. If only broadcast API exists, filter by bound connection before send and require correlated reply from exact peer; never broadcast action to all clients and discard unwanted responses afterward.
5. Forward finite methods with per-call cancellation/timeout and expected owner. Check attachment and authorization again at completion. Connection failure is terminal for request; no retry.
6. Implement heartbeat/loss/expiry with injected clock for tests. Keep current runtime summaries separate from grant identity. Subscribe to public project close/source lifecycle and invalidate matching registrations.
7. Pin authorized list snapshots for bounded pagination, but re-filter authorization each page and each resource read; revocation cannot leak retained summary. Apply serialized byte and item limits together, preserving next unconsumed item across pages.

## API changes

`createHistoireDevframe({ project, liveSessions: { identifyPeer, authorize } })`, host-only `createSessionGrant`, and owned adapter `dispose` from [contracts](contracts.md).

## Failure paths

Default deny on missing/throwing authorization. Unverified transport principal is fatal to agent dispatch. Hidden session returns `SESSION_NOT_FOUND`; lost known attachment returns `SESSION_DISCONNECTED`. Registry IDs are not bearer credentials.

## Validation commands

Broker unit tests with fake clock and deferred requests; real Devframe connection tests with two tabs and separate principals; shared host connection survival on disposal.

## Acceptance criteria

No cross-session/project/principal routing or result leakage; lease and teardown scenarios proven with real sockets. Caller project/connection remain caller-owned.

## Non-goals and handoff

No general auth service, user management, remote source probing, persistent sessions, or arbitrary browser execution. Hand off authorized service interface and integration fixture to 08/12.
