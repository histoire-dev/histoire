# 13 — Tests and cancellation

## Outcome and prerequisites

Depends on: 04, 08, 09. Node capture also requires [MCP slice 16](../mcp-server/16-capture-determinism-and-globals.md).

Explicit preview/server test execution yields one attributable result, preserves lifecycle deadlines, and owns cancellation cleanup. [public-api.md](public-api.md) owns methods/errors/budgets; [coordination.md](coordination.md) owns shared Node lane/MCP boundaries.

## Owned files

- Add Vue components/tests/HistoireTests.vue and tests/{collection,run,results}.ts.
- Extend SDK session test service, app/embed/adapters/tests.ts, and preview runtime request handling.
- Add/extend packages/histoire/src/node/runtime/{execution-service,execution-types}.ts; reuse landed MCP lane.
- Adapt node/test/{run,types,index,summary,preflight}.ts, Vitest browser lifecycle/cleanup, and existing app test stores as adapters.
- Extend existing targeting/lifecycle/mocker tests; add core embed execution-lane.spec.ts, cancellation.spec.ts, test-capabilities.spec.ts, and browser tests-execution.spec.ts.
- Add node/api/capture.ts exposing project.captureScreenshot over landed mcp/browser/{session,screenshot,preview-host,readiness,cleanup}.ts and the same lane; capture determinism options land in MCP slice 16 and are shared, not reimplemented. Add browser node-capture.spec.ts to the embed integration suite.
- Consume slice-04 preview capture-source handle and slice-03 immutable built-target reader. Route/catalog ownership stays in those slices; capture adapter validates source/target/epoch at admission and closes only job-owned browser/lease.

## Tests first

1. Queue runs for distinct exact targets on same project; one lane, no target contamination, cleanup complete before next run.
2. Abort before enqueue, while queued, during collection, and during browser run. Check no later publication and eventual observed teardown.
3. Preview navigation/HMR/close during run cannot publish result into new document, even same story/variant IDs.
4. Failed assertion resolves completed summary; collection failure, missing dependencies, unavailable runtime, transport loss, and timeout reject typed errors.
5. Static source rejects server mode without invoking preview/server engine. Preview execution failure never invokes server fallback.
6. Preserve per-test/hook and overall lifecycle timeout regressions, mocked modules, external specs, and collection diagnostics.
7. Node capture (factory H3/H4): ready dev handle and, separately, copied static preview under nested base with embed disabled/no live dev catalog produce PNGs with settings/globals applied. Original story files changed/removed after build cannot change built-target lookup. Capture uses actual same-origin nonce route; no active/capture-capable source yields CAPABILITY_UNAVAILABLE.
8. Decode PNG size at DPR 1, 2, and maximum viewport/DPR 3; dimensions follow [Node capture contract](public-api.md#node-sdk). Retain 4 MiB cap independently. Two captures of animated fixture return identical SHA-256; invalid DPR rejects before launch.
9. Abort/preview restart/close during queued or active capture rejects old work, expires nonce routes, closes owned browser, and drains lane before next job. When dev and preview both exist, preview source chosen; unavailable chosen source never falls back to dev or retries capture.

## Implementation steps

1. Implement collect/run with explicit mode and captured selected target/runtime/source generation. Missing primary only affects preview/collection; server mode requires advertised dev engine.
2. Preview adapter invokes existing embedded test session in owned ready frame. Keep test/hook deadline ownership there; bridge adds transport backstop, not competing lifecycle timer.
3. Server adapter invokes same project execution service as Node SDK/MCP. Reuse current runner/browser dependency resolution; do not create another queue or test collector.
4. Serialize server execution per project; preserve queued captured target. Cancellation removes queued job without executing it.
5. Propagate AbortSignal through supported Vitest/browser cleanup paths. If current runner cannot safely abort work, suppress publication immediately, observe work, and hold lane until cleanup confirms completion.
6. Preview abort/navigation retires publishing owner immediately. Use existing cancellation when supported; otherwise retire affected frame/document safely. Session reports unavailable runtime until caller explicitly restores it; never silently replay run.
7. Keep run summary wire-safe with exact target/run/document identity. Assertion failures remain run results; initialization/collection/transport failures never become zero-tests success.
8. Cleanup runs in finally and completes before releasing lane. Teardown failure quarantines unavailable executor rather than starting overlapping run.
9. Expose test progress through attributable subscribed messages with bounded payloads. Detach listeners/timers on completion/abort and observe late completion.
10. Replace existing app automatic preview-to-server fallback only through compatible explicit mode UI; standalone adoption finalizes that integration in slice 14.
11. Keep MCP principal/job/quotas/auth and deployed built-preview executor outside browser test protocol.
12. Implement project.captureScreenshot per [public-api.md](public-api.md#built-preview-capture-ownership): choose active preview source when present, otherwise dev; require chosen source ready. Capture exact immutable catalog/base/origin/epoch and validate target at admission, revalidate active owner at lane head, then use shared browser task with MCP slice-16 options and scaled PNG checks. Return bytes/hash without MCP store/principal/quotas. Finally close job-owned browser/nonce lease; handle registry remains alive until preview closes. Never validate preview target through current source collection or navigate ordinary index.html as capture host. Browser SDK still has no screenshot API.

## API changes

Enable HistoireTests/tests surface and explicit preview/server operations per public-api.md. Node runTests gains signal propagation through shared lane. No silent fallback, duplicate retry, implicit dependency install, or static server-tests capability.

## Failure paths

Abort is CANCELLED, timeout TIMEOUT, dependency absence DEPENDENCY_MISSING, collector failure COLLECTION_FAILED, and disconnected/stale ownership typed transport/runtime error. Failed assertions resolve summary. Uncertain teardown never releases lane early.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test src/node/__tests__/embed/execution-lane.spec.ts src/node/__tests__/embed/cancellation.spec.ts src/node/__tests__/embed/test-capabilities.spec.ts
pnpm --filter histoire test
pnpm --filter histoire test:embed:integration tests-execution node-capture
pnpm run lint
~~~

Run landed MCP queue/test regressions and existing Vitest mock/deadline scenarios. Record actual supported cancellation versus publication suppression.

## Acceptance criteria

- One requested engine runs once and returns attributable result.
- Cancellation/navigation/HMR suppress stale publication and preserve cleanup/lane ownership.
- Dependencies/collection/capability failures remain distinct from assertions/no tests.
- Existing lifecycle/mocking/spec behavior retained; static server mode denied.
- Node captureScreenshot is deterministic for fixture stories and shares lane, browser host, and cleanup with MCP screenshots.
- Copied static preview captures without dev catalog, uses scoped nonce route, preserves CSS/PNG DPR semantics, and cannot publish after preview restart/close.

## Non-goals

New test runner, host-side story tests, browser SDK screenshots, batch capture (planned later, H5), automatic retry/fallback, MCP job schema changes, and arbitrary remote specs.

## Handoff

Give execution service API, cancellation guarantees/limits, queue/cleanup evidence, built/dev capture-source selection, PNG dimension/byte proof, summary projection, and explicit mode UI to slices 14/16. Node SDK/MCP adapters consume same lane without exposing their transport policies.
