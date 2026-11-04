# 00 — Baseline, contracts, and acceptance

Status: **complete** (2026-11-04, see evidence). Dependencies: none.

## Goal

Establish current implementation baseline and freeze cross-slice interfaces before changing CLI behavior. Creating this document does not complete this slice.

## Source targets

- Parent/child: `packages/histoire/src/node/commands/dev.ts`, `dev-child.ts`, and `node/bin.ts`.
- Proxy: `packages/histoire-dev-proxy/src/{index,protocol}.ts`, `process/child.ts`, `lifecycle/coordinator.ts`, `config/watcher.ts`, `server/http.ts`.
- Runtime/catalog: `packages/histoire/src/node/runtime/{dev-session,start,types,execution-service,execution-owner}.ts`, `catalog/{attachment,publication}.ts`.
- Tests/evidence: `packages/histoire/src/node/test/{execution-service,isolated,types,progress-reporter}.ts`, `test/eligibility/{index,evidence}.ts`.
- Launcher/fixtures: `scripts/dev-histoire.mjs`, existing CLI/browser/MCP/launcher/package tests referenced by [validation](validation.md).

## Implementation steps

1. Capture HEAD, scoped status, and current file content relevant to implementation. Planning reference is `bfae3c4d03aa6a644ada0f1b7327e31ad218bb83`; dirty files are additional source, not discardable noise. Identify concurrent modifications before editing shared files.
2. Trace listener binding before project evaluation, config correction, full child winddown, output piping, catalog readiness, shared queue admission, dependency evidence invalidation, and launcher stdin ownership.
3. Reconcile these observations into [architecture](architecture.md). Preserve current exported behavior and private authentication rules; do not copy historical versions over current work.
4. Review/freeze [contracts](contracts.md): activation, shortcuts, state, command/events, correlation/generation, page/byte bounds, retention, cancellation, watch scope, missing targets, and shutdown.
5. Record terminal state ownership: lifecycle/generation, URLs, current phase, view/search/selection, test scope, watch preference, operation IDs. Distinguish durable parent preference from child-owned execution authority.
6. Confirm parent import boundary and package exports. Type-only use must not pull runtime into early listening path. Document existing heavyweight imports that must stay lazy.
7. Select baseline checks from [validation](validation.md); run once against current sources/builds and record preexisting failures separately. A successful build can mutate `dist`, so coordinate with active consumers.
8. Map each feature and edge case to owning slice/test category. Establish receipt format without marking future behavior as available.

## Useful tests and baseline

Existing proxy suite and real `mcp/dev-command-lifecycle.spec.ts` establish occupied-port/early-bind, process replacement, config-failure recovery, and shutdown contracts. Inspect current tests before extending. Existing `mcp/integration/execution.spec.ts` is execution regression seam, not proof of terminal ownership until exercised through new adapter.

Protect public outcomes: startup page during held configuration, exact stable URL after correction, old PID gone before new generation, and listener reusable after close. Source substring assertions cannot prove import/lifecycle behavior.

## Acceptance criteria

- Current source/dirty state and reuse seams recorded.
- All accepted features and failures map to slices and decisive observable checks.
- Shared contract documents agree; no unresolved policy is deferred to implementer.
- Baseline results are actual executions, with failures/platform limits separated from planned work.

## Exclusions

No TUI, watcher, runner, IPC, or launcher implementation in this slice. Do not clean unrelated work or infer existing features from names/types.

## Handoff receipt

Append receipt to [evidence](evidence.md): HEAD/dirty paths, inspected boundaries, baseline commands/results, contract deviations, and readiness for 01. Mark this slice complete only after these checks run; source reading alone is insufficient.
