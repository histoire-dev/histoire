# 06 — HTTP requests and runtime diagnostics

Status: **complete** (2026-11-04, see evidence). Dependencies: [02](02-progress-and-restart-reasons.md), [03](03-terminal-surface-and-modes.md), [04](04-logs-errors-and-session.md).

## Goal

Inspect real public-server activity and current runtime diagnostics without changing requests or retaining sensitive traffic.

## Source targets

- `packages/histoire-dev-proxy/src/server/http.ts`, proxy options/events in `src/index.ts`.
- `packages/histoire/src/node/terminal/` request history/view and info/panel projections.
- `packages/histoire/src/node/runtime/terminal/` diagnostics adapter; canonical catalog diagnostics and existing safe MCP activity snapshots.

## Implementation steps

1. Add optional framework-neutral HTTP observation callback at public listener. Register completion/close/error observers before request dispatch. Use one finalization guard; mark incomplete client response as aborted even when backend work later finishes.
2. Capture method, pathname without query, status where available, outcome, monotonic duration, and parent-assigned stable ID. Do not consume or clone body, replace response methods, or inspect headers for display.
3. Exclude proxy-owned status stream/loading JS/chunks. Include forwarded document/assets/API requests, including during startup/restart. WebSocket upgrades remain outside scope.
4. Skip observation allocations/listeners where callback is absent. Optional observer failures must not fail HTTP response or produce recursive diagnostics.
5. Retain 500 completed entries, report omission, and share navigation/search/detail/copy infrastructure. Live request metadata must also be bounded rather than accumulating forever on stalled connections.
6. Project generation-safe collection diagnostics and safe MCP enabled/disabled/endpoint/client summary. Reuse existing sanitization/snapshot instead of retaining protocol arguments, bearer token, or arbitrary client envelope.
7. Update session view and compact panel diagnostic counts without overriding usable content after partial collection failures. Failed diagnostic retrieval shows scoped failure while server and other views stay usable.
8. Retain history across runtime replacement; new metadata is accepted only from current generation. Do not infer request-to-log association from timing.

## Useful tests

- Real proxy requests return same known status/body with observer absent/present; streamed body is not buffered or altered.
- Complete success, backend failure, startup response, and client abort each yield one expected record. Hold external response to demonstrate pending/aborted distinction; release gate and prove no duplicate completion.
- Distinct secret query/header/body strings never appear in retained/copied records; record path contains pathname only.
- Status SSE and loading assets produce no record while forwarded assets do.
- Disabled/enabled MCP and partial collection failure reflect actual runtime state; observer exception does not break subsequent request.

## Acceptance criteria

Request history reflects real traffic, remains bounded, and does not alter forwarding or disclose credentials. Diagnostic state remains generation-owned and independent of server availability.

## Exclusions

No headers/body inspector, request replay, browser fetch collection, WebSocket frame history, request timeline, or arbitrary log correlation.

## Handoff receipt

Record HTTP observation boundary, exclusions, exact response/abort/redaction checks, live-metadata bound, and diagnostics availability in [evidence](evidence.md). Source observation alone is not network behavior proof.
