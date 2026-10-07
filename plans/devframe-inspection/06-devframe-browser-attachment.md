# 06 — Optional browser attachment

## Outcome and prerequisites

Depends on: 03. Attach caller-owned SDK session to caller-owned Devframe connection using public APIs and bounded descriptors.

## Owned files

- New `packages/histoire-devframe/src/client/{index,attachment,registration,requests,projection}.ts` and browser-safe `src/types/`.
- Adapter client import/lifecycle/routing tests; reuse SDK consumer fixtures.
- No imports from `@histoire/sdk/internal` and no private session field access.

## Tests first

1. Attach and dispose twice; original session and connection remain usable. Reentrant dispose joins one closing promise.
2. Duplicate attachment for same session/connection rejects before duplicate subscriptions; different sessions remain distinct.
3. Expose only requested and granted capabilities; read-only attachment cannot register highlight, mutation, test, or editor handler.
4. Session disposed, source epoch changed, connection lost, or grant denied during attach removes partial registrations.
5. Deferred request captured for old runtime rejects after replacement; no reconnect queue flush. Browser bundle includes no server/MCP/Playwright imports.

## Implementation steps

1. Implement `attachHistoireDevframe` contract using supplied connection, session public snapshot/subscriptions, and one-use grant. Broker handshake is implemented against explicit fixture contract here; real server arrives in 07.
2. Register finite versioned attachment methods, never a generic `invoke(method, args)` over arbitrary session properties. Every method parses input and intersects exposure with current capabilities.
3. Map requests to public inspection/event methods with expectedOwner and AbortSignal. Keep four-request cap and per-document audit limit from SDK; adapter must not multiply limits by adding connections.
4. Publish summary containing mode/source/owner/readiness/capabilities, excluding state, grants, credentials, host settings, and arbitrary source metadata.
5. Invalidate registration synchronously on disposal/source retirement. Runtime changes update summary and abort captured work while retaining valid source attachment.
6. Reserve disposal promise before notifying callbacks; unregister exact handles and stop heartbeat. Slice-01 probe must establish the actual collector removal API; registration is not assumed to return a disposer. If only an exposed definition map exists, prove identity-checked deletion also invalidates upstream caches before adopting it. Never clear caller-owned registry. No connection.close/session.dispose calls.

## API changes

Public `/client` attachment API and readonly attachment handle with `getSnapshot`, `subscribe`, and `dispose` from contracts. `webmcp` defaults false; registration delegated to 13.

## Failure paths

Missing/untrusted connection returns explicit error; no automatic Devframe server discovery or creation. Expired pairing grant cannot be reused. Source registration revoked on epoch change; host supplies new grant explicitly.

## Validation commands

Adapter client unit tests, browser bundle graph/import checks, actual SDK host fixture with Devframe browser client; packed proof deferred to 14.

## Acceptance criteria

Attachment observes existing session without mounting extra story or taking ownership. Scope and cleanup tests pass with actual browser client.

## Non-goals and handoff

No server, MCP exposure, external iframe DOM access, or generic shared-state mutations. Hand off registration wire DTOs, cleanup semantics, and browser fixture to 07.
