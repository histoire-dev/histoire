# 02 — Shared bounded inspection core

## Outcome and prerequisites

Depends on: 01. Extract reusable readers and isolated orchestration without changing current inspection behavior.

## Owned files

- Move implementations from `packages/histoire/src/node/mcp/browser/inspection/{state,dom,result,task,diagnostics}.ts` into new portable `packages/histoire-shared/src/inspection/` and Node `packages/histoire/src/node/runtime/inspection/` modules according to [architecture](architecture.md).
- Keep compatibility exports at old paths; update `node/virtual/preview-runtime/runtime-service.ts` and Node browser callers.
- New focused shared-reader tests; extend existing `node/__tests__/mcp/inspection-tools.spec.ts`, `inspection-browser.spec.ts`, and runtime state fixtures.

## Tests first

1. Characterize current output for refs, functions, getters/computed refs, cycles, automatic prop overrides, and absent metadata. Getter counters remain zero before and after extraction.
2. DOM traversal stops globally at byte/node/depth bound; password/textarea values and arbitrary attributes remain excluded; open shadow roots still work.
3. Long identities/metadata fit complete result budget; every loss path marks truncation.
4. Execute extracted readers through actual emitted runtime and Playwright serialization, catching free variables hidden by direct unit invocation.
5. Existing MCP tools/resources preserve output and error shapes.

## Implementation steps

1. Inventory browser-safe versus Node-only imports. Separate result DTO/budget policy from MCP schema/envelope logic.
2. Move state/DOM projection once. Preserve self-contained emitted reader functions or introduce explicit dependency injection in generated runtime; no hidden module captures.
3. Move fresh-browser inspection task to shared runtime service with generic typed input/result. Reuse existing browser host/session, readiness, cleanup, deadlines, and diagnostics sanitization.
4. Keep MCP adapter responsible for strict parsing, operation kind, retention, artifact/resources, and legacy result shape. Avoid importing MCP operation types into portable core.
5. Re-export temporarily at old paths, update imports, then remove only proven unused wrappers. Do not copy algorithms for live mode.

## API changes

Internal shared services and browser-safe reader exports. No changed public SDK or MCP behavior yet.

## Failure paths

Missing optional browser dependency, cancelled job, stale source, and cleanup failure preserve current error classification. Never execute getter for a more complete result. Budget exhaustion returns bounded partial data, not unbounded fallback.

## Validation commands

Run focused projection/DOM/runtime-emission tests, `pnpm --filter histoire test:mcp:integration` inspection cases, protocol/shared/histoire builds, scoped lint, and diff check.

## Acceptance criteria

Existing isolated inspection passes characterization and transport tests. Runtime reader no longer depends on MCP orchestration; Node service reusable without MCP server.

## Non-goals and handoff

No new schemas, framework trees, public API, or behavior cleanup. Hand off shared reader entry points and generic task to 03/04/09/10 with compatibility evidence.
