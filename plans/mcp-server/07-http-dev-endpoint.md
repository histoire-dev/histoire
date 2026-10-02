# Slice 07 — Default-on dev MCP endpoint

## Outcome and prerequisites

Plain `histoire dev` serves tools/resources at separate loopback `/mcp` endpoint without extra setup. Depends on 02 and 05. Explicit CLI/config opt-out is available. MCP listener survives ordinary project restarts; project state lives in controller, not per-request SDK server. Production listener consumes reusable transport policy from this slice in 12.

## File ownership

- Modify `packages/histoire/src/node/{bin.ts,commands/dev.ts,config/defaults.ts}` and `packages/histoire-shared/src/types/config.ts` for mcp defaults/options.
- Add `packages/histoire/src/node/mcp/transport/{http,http-options,http-guards,http-auth,http-body}.ts`. Listener/guard policy accepts dev-local or protected-node mode without importing dev Context.
- Reuse/extract bounded-byte stream logic from `packages/histoire/src/node/util/http-body.ts` where appropriate; retain default behavior for existing consumers and add byte-accurate tests if changing it.
- Add `packages/histoire/src/node/__tests__/mcp/{http,http-security}.spec.ts`.
- Extend common SDK client/process harness from 01/06.

## Tests first

1. Plain dev starts MCP automatically and real current/legacy native clients can read without token. --no-mcp and mcp:false disable listener; --mcp overrides false config; --mcp-port precedence is explicit. Disabled path imports no server SDK at runtime.
2. `--host 0.0.0.0` for UI never widens MCP beyond 127.0.0.1. Wrong Host, hostile Origin, Origin:null, token in query, and unsupported path fail before service dispatch. With configured token, absent/wrong bearer fails; without token, native no-Origin requests succeed.
3. Browser Origin is accepted only if equal to MCP endpoint origin; no UI-origin permission or wildcard CORS. Malformed optional token fails enabled startup rather than silently downgrading authentication.
4. Body cap applies to chunked, incorrect Content-Length, and multi-byte UTF-8 uploads. Invalid JSON cannot crash listener. Token/error responses never echo token.
5. Two dev projects start successfully when default 6007 occupied, second reports ephemeral endpoint. Explicit port conflict fails; port 0 reports actual URL. Ordinary config restart keeps listener address, changes epoch, exposes restarting, and rejects stale handles. Changed mcp enable/port policy replaces listener without leaving old socket active.
6. Closing listener stops admission/active protocol calls, then closes controller resources once. Two clients' concurrent requests have isolated errors/results without shared mutable SDK instance.

## Implementation steps

1. Add config mcp default true plus --no-mcp, --mcp, --mcp-port. Resolve precedence from contracts, validate integer 0–65535. Distinguish default port from explicitly requested port. No dev MCP host/origin override; do not inherit UI --host.
2. Capture optional HISTOIRE_MCP_TOKEN before config evaluation. If configured and enabled, decode approved hex/base64url forms and require >=32-byte length; compare bearer in constant time. Absent token needs no generation/setup/file/log and does not prevent dev startup. Protected-node policy later requires token.
3. Remove captured token from process.env before evaluating project config; never put it on Context or forward to project/browser worker environment. Disabled endpoint does not require credentials. Token rotation requires command/process restart; config-only restart retains captured token.
4. Start one listener at command/controller scope, independent of active generation. Create SDK createMcpHandler factory closing over facade and explicit local/verified principal. Configure modern JSON responses and SDK stateless legacy compatibility. Reconcile changed enabled/port policy on config restart; ordinary config changes keep listener stable. No 2025 session management/subscriptions.
5. Use SDK Node adapter and localhost Host/Origin guards. Require exact `/mcp` path with no credential/query parameters. Accept only SDK-supported methods; use SDK response behavior for current/legacy discovery rather than hardcoding obsolete GET/SSE behavior.
6. Apply explicit policy: dev-local without configured token uses controller-local principal; configured token uses verified identity through SDK authInfo seam. Reusable protected-node policy always requires supplied credentials and configured public Host/Origin; 12 owns its runtime setup. Do not present local access/shared token as per-user isolation or OAuth flow.
7. Cap request body at 1 MiB measured bytes. Prefer pinned SDK supported body limiter; otherwise wrap fetch-bound request body with bounded stream before handler.fetch, using reusable byte-limit primitive and SDK Node adapter for response streaming. Do not consume request body twice or add a second JSON-RPC parser.
8. Limit 16 concurrent HTTP calls; excess returns 429 with Retry-After. Execution queue quotas are separate and implemented in 08. Reject oversized body with 413, invalid Host/Origin with 403, missing/invalid bearer with 401. Log only bounded sanitized diagnostics.
9. On config restart factory resolves current facade status; old accepted operations remain epoch-bound. Retain captured token and unchanged listener policy; reconcile changed enabled/port policy as in step 4. Avoid duplicate socket/signal listeners.
10. Print actual MCP URL beside UI URLs; mention auth only if configured, never print token. Default-port collision follows documented ephemeral fallback. Other bind/start failure unwinds runtime; close hooks are observed/idempotent. Stdio worker explicitly selects no dev HTTP listener and remains unaffected by config default true.

## Acceptance and validation

Real SDK client tests for both promised revisions, HTTP security/body-limit suite, core build, focused lint, and ordinary dev regression. Verify bound address through `server.address()` and actual request behavior. Document legacy compatibility mode/version from pinned SDK; no untested protocol claims.

## Non-goals and handoff

No production routing/package artifact in this slice, dev LAN binding, OAuth provider, wildcard CORS, client configuration mutation, or subscriptions. Handoff includes default-on/opt-out behavior, guard policy reusable by production server, and stable/reconfigured listener lifecycle.
