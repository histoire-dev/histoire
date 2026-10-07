# 05 — Bounded correlated debugging timeline

## Outcome and prerequisites

Depends on: 03. Add `session.debug` and attributed runtime observers without replacing component events or changing their retention contract.

## Owned files

- New `packages/histoire-sdk/src/session/debug/{store,controller,correlation}.ts`; narrow instrumentation in request/state/events/lifecycle.
- New shared browser observers under `packages/histoire-shared/src/inspection/diagnostics/` and runtime installation module.
- Protocol debug DTO/validator and finite subscription command/event implementation.
- SDK debug tests, runtime observer tests, real browser lifecycle integration.

## Tests first

1. Same captured request ID correlates start/end; request failure records captured retired owner without modifying replacement runtime.
2. Runtime events with identical names from different targets remain distinguishable; unattributed console is not assigned invented causal parent.
3. Rate/count/byte retention produces exact loss counters and cursor gaps; clear preserves monotonic sequence.
4. Multiple observers share one wrapper; removing one leaves others functional. Final disposal restores only owned console wrapper, preserving another tool's later wrapper.
5. Throwing subscriber and hostile console argument getters do not break app or other subscribers. No observers when feature disabled.

## Implementation steps

1. Implement detached immutable ring buffer using common byte sizing. Keep event history and debug history separate, with explicit references rather than duplicated large payloads.
2. Capture SDK request lifecycle, state patch key summaries, component events, source/runtime replacement, and explicit correlation IDs. Do not record entire patches by default.
3. Install console/error/rejection observation only when diagnostics enabled and subscribed. Preserve original console arguments/behavior; derive bounded text without traversing arbitrary objects.
4. Feed validated batches through current bridge; sequence/drop accounting owned at each boundary. Mark missing intervals, not synthetic entries.
5. Expose paged snapshot and future subscription handle with `ready` and async `unsubscribe` from contracts. Reserve handle before bridge registration so immediate unsubscribe/reentrant disposal joins cleanup. Runtime observer teardown follows document lifetime; session retains historic attributed records until clear/dispose.
6. Accept bounded `correlationId` metadata on inspection calls for joining SDK trace to existing Node MCP observer records. It never changes authorization, request identity, or deduplication; no server entries inserted into browser monotonic sequence.

## API changes

`session.debug.getSnapshot/subscribe/clear`, `debug.subscribe/unsubscribe`, `debug.entries`. Runtime diagnostics capability separate from collection diagnostics in existing snapshots.

## Failure paths

Disabled/missing instrumentation reports unavailable, not empty successful history. Subscriber failures counted/isolated. Transport loss ends observation; no implicit reattachment/replay. No network completeness claims.

## Validation commands

Focused ring/correlation/observer tests, real two-session browser test, existing events/state/request lifecycle regressions, build/lint.

## Acceptance criteria

One user interaction can be followed across SDK request, runtime event, and error with accurate identity; all observers removed after disposal; bounded adversarial input tests pass.

## Non-goals and handoff

No full console object inspector, response bodies, CPU/heap profiling, dependency graph, or time travel. Hand off public trace paging/subscriptions to 08/11 and mark fields that cannot establish causality.
