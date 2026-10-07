# 03 — Live inspection through browser SDK

## Outcome and prerequisites

Depends on: 02. Implement `session.inspect.variant/dom/highlight` through existing authenticated runtime bridge, including exact grid targets.

## Owned files

- New `packages/histoire-sdk/src/session/inspection/{index,request,target}.ts`; wire in `session/controller.ts` and `types.ts`.
- Protocol bridge registries/validators/results and runtime message types for this slice's finite commands.
- `packages/histoire-app/src/embed/{commands,capabilities}.ts` and focused inspection adapter adjacent to `adapters/runtime-requests.ts`.
- New `packages/histoire/src/node/virtual/preview-runtime/inspection-service.ts`; integrate message handler and existing element inspection.
- SDK `inspection.spec.ts`, runtime `preview-inspection.spec.ts`, and embed integration `inspection.spec.ts`, reusing existing fixture factories.

## Tests first

1. Modify actual story state; live read observes it without mount count/document change. No primary means explicit error, never hidden mount.
2. Two sessions and repeated same story IDs remain isolated. Explicit mounted grid cell inspection does not change selection; virtualized absent cell rejects.
3. Replace source/document/cell during request; late result rejects. Sibling selection change does not invalidate explicitly captured surviving cell.
4. Denied cross-origin origin/policy, data/control port, forged runtime/target, and unknown fields reject before reader execution.
5. Cancellation/timeout removes request listeners and highlight; old owner cannot clear successor ring. Ordinary state/channels remain unchanged.

## Implementation steps

1. Add capability-gated public methods with readonly output and local AbortSignal handling. Capture immutable source/target/runtime tuple before awaiting.
2. Extend ownership scope for explicit target without relaxing default selection-bound methods. Validate target against ready primary viewport/cell inventory, including actual document identity for separate iframe cells.
3. Route through existing SDK transport and source-owned frame adapter. Source must enforce inspection enablement and exact `inspection.allowedOrigins` policy at execution, not only descriptor projection. Cross-origin callers must also pass existing embed allowlist. Consume top-level descriptor extensions from contracts without extending legacy strict capability/embed objects.
4. Dispatch inside runtime only after existing parent/port/document guards. Call shared safe readers directly; do not use ordinary `state.get` serializer for inspection.
5. Add finite request cancellation and four-read admission cap. Late/stale completion never publishes. Maintain current bridge size policy with explicit inspection result cap.
6. Reuse picking/geometry helpers for runtime-local highlight. No focus/selection mutation; clean overlays on expiry/retirement.

## API changes

First public browser inspection methods and capabilities; new bridge commands/events from [contracts](contracts.md). Component/audit methods remain unavailable until their implementation slices.

## Failure paths

Use existing readiness/ownership errors plus `INVALID_SELECTOR`; `CAPABILITY_UNAVAILABLE` for old/disabled sources. Preserve exact runtime guard on both success and rejection. Cross-origin denial cannot fall back to parent DOM access.

## Validation commands

SDK focused tests; protocol tests; real embed integration in same/cross origin and grid modes; existing state/channel/readiness regressions; affected builds/lint.

## Acceptance criteria

Real-browser SDK reads current state/DOM with no extra mount, all replacement/origin tests pass, and old sources/core workflows remain usable.

## Non-goals and handoff

No Devframe, full component tree, axe, ARIA emulation, or state mutation API changes. Hand off session inspection methods and exact ownership tests to 05/06/09/10.
