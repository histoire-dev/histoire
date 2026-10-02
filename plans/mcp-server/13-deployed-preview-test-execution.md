# Slice 13 — Tests against deployed compiled previews

Implemented 2026-10-02. Dedicated slice agent added fixed host test dispatch, compiled preview executor, additive exact protocol authority, reusable summary aggregation, production default registration and focused lifecycle tests. Evidence: [implementation ledger](evidence.md#slice-13--compiled-preview-test-execution).

## Outcome and prerequisites

Deployed MCP can execute compiled story/variant tests through existing embedded preview runtime without original project source or Vitest Node server. Depends on 09, 10, 11, and 12. Dev continues project-vitest engine; Node reports built-preview engine explicitly.

## File ownership

- Add `packages/histoire/src/node/mcp/browser/{preview-client,preview-tests}.ts` for fixed trusted host protocol operations.
- Extend shared browser preview-host/readiness service and deployed executor registration; reuse artifact/result paging/sanitizer from 10.
- Extend private manifest capability writer only to reflect actual included embedded runtime, not inferred test counts from static source text.
- Add `packages/histoire/src/node/__tests__/mcp/{deployed-tests,deployed-test-cancellation,deployed-test-parity}.spec.ts` plus generated-artifact browser integration.
- Reuse shared preview messages/test summary helpers and existing variant-test-session; no new assertion/hook/suite runner.

## Tests first

1. Build story containing pass/fail/skip/todo/only and hooks; copy artifact outside project; Node MCP runs compiled variant and returns existing summary with engine:built-preview. No project Vitest/Vite lookup or source import.
2. Embedded runtime absent in build yields CAPABILITY_UNAVAILABLE; embedded runtime present but Playwright/Chromium missing yields dependency/browser error. No tests in valid rendered variant completes total 0 rather than unavailable/failure.
3. COLLECT_TESTS and RUN_TESTS requests/replies are correlated by unique requestId/runId plus exact selected story/variant/frame/origin/nonce/epoch. Hostile IDs/delimiter collisions cannot settle another job.
4. Whole-story selection executes each catalog variant sequentially with isolated context and correctly aggregated counts/errors/identities. Explicit variant runs only it. Document preview engine's suite/only semantics with focused parity tests; do not claim CLI reporter behavior.
5. Long test, hook failure, page error, runtime collection error, cancel, close, and process restart produce exact job status and owned browser teardown. Cancelling kills context/page when embedded callback cannot cooperate; no extra per-test deadline owner.
6. Built mock/MSW story runs with emitted worker/chunks; no dev websocket/module resolver required. Readiness and test result round-trip obey current static preview mock contract.

## Implementation steps

1. Register deployed test executor only from production assembly, sharing same job store/execution lane as screenshots. Do not import runHistoireTests, collectStoriesBrowser, test/vitest-config, or project dependency preflight into production bundle.
2. Validate story/scoped variants against immutable manifest at admission. Check testRuntimeIncluded and Playwright package presence, then create fresh same-origin host/context for selected variant using 09/12 service.
3. Wait existing SANDBOX_READY/VARIANT_READY. Send COLLECT_TESTS with unique correlation ID and existing variantKey as compatibility field; independently retain tuple identity and nonce so concatenated variantKey alone is never authority. Correlate returned definitions/error without assuming static parser reveals tests.
4. Send RUN_TESTS with unique runId; require exact frame/origin/nonce/epoch and requested tuple-compatible response. Existing runVariantTests/createVariantTestSession owns registration, hooks, assertions, test deadlines, and summary. Fixed host code can invoke only these registered protocol operations, never caller JavaScript.
5. For whole-story run, repeat variant session sequentially and aggregate existing summary fields/case identities. Keep collected errors and failures; do not silently skip failed variant load. Use shared summary merge utility if already available; add one generic pure aggregator to shared test-results only if needed by both public consumers.
6. Preserve embedded explicit per-test/hook timeouts. Job safety timeout uses build-recorded validated existing test.runTimeout, with sensible configured collection deadline and 10-second cleanup. These guard whole operation, not replace embedded per-test deadlines. Serialized deployment settings contain numeric validated timeouts, never config callbacks.
7. Cancel/reset closes exact owned page/context/browser and observes pending host promises. Discard late postMessage results after cancellation/generation change. Unknown teardown blocks execution as in 08; no repeated RUN_TESTS after uncertain response.
8. Reuse 10 sanitizer/result byte caps/operation resource paging. Return engine:built-preview, aggregate summary, and truncation metadata. Distinguish collection/runtime errors from failed assertions; no invented CLI Vitest module diagnostics for compiled engine.
9. Advertise actual capabilities from immutable build/runtime availability. Build includeSource setting does not disable test engine because compiled story modules already exist in public assets.
10. Add parity cases between dev project-vitest and compiled preview for observable counts, names, modifiers, hooks, errors, and explicit deadlines. Differences in CLI reporters/workspace-level filtering are outside contract; document any observable engine difference rather than hide it.

## Acceptance and validation

Actual generated Node artifact in source-free environment, official SDK client, Chromium execution/cancel/mock/parity suites, existing variant-test lifecycle/preview protocol tests, shared/core builds, focused lint. Test success requires actual compiled execution and cleanup, not merely compatible JSON result stub.

## Non-goals and handoff

No runtime project recompilation, CLI reporters, coverage, watch, test-name filtering, test source editing, browser click/evaluate API, or project-wide test run. Handoff includes compiled-engine capability and behavior evidence, shared cleanup/result service, and production test workflow ready for 14.

## Implemented behavior and evidence boundary

- `mcp/browser/preview-test-script.ts` installs fixed `collect`/`run` dispatch. Requests and responses retain exact frame, origin, marker, host nonce, project epoch, story, variant and live document identity, plus independent UUID request/run IDs. Compatibility `variantKey` is never authority. One request dispatches once; navigation/cancellation rejects delayed completion without repeating side effects.
- `preview-client.ts` drives existing `COLLECT_TESTS`/`RUN_TESTS` messages. Existing embedded `createVariantTestSession` owns assertions, registration, modifiers, suite hooks and explicit test/hook deadlines. No Vite, project source/config or Node Vitest imports enter production graph.
- `preview-tests.ts` registers default production tests through `registerNodeTestExecutor`. Whole-story jobs iterate immutable catalog variants sequentially in fresh browser/context/page sessions. Recorded `test.runTimeout` bounds whole job; recorded per-story collection deadline bounds definition response. Owned cleanup retains lane until confirmed, including cancellation.
- `mergeHistoireTestSummaries` in shared package replaces existing project runner's manual aggregation too. Shared sanitizer/result retention/page limits apply to both engines. Failed assertions remain completed operation with `summary.ok: false`; runtime collection/preview failures produce failed operation. Valid rendered variant with no tests returns successful total zero.
- Embedded `.only` applies to each variant's collected definitions; skipped/todo/filtered cases remain skipped in summary. CLI reporter behavior, Node Vitest workspace filtering and CI `allowOnly` policy are outside compiled-engine contract. Normal, failing assertion, explicit 30 ms deadline and no-test aggregate counts matched actual project-Vitest slice 10 probe. Added `.only`/todo/hook/mock cases establish compiled behavior; they are not separate live Node-Vitest parity claims.
- Real source-free proof found nested build config precedence bug: defaults silently overrode `build.node.includeSource: false` and config target. `config/merge.ts` now keeps defu's higher-priority input order while preserving accumulated vendor exclusions, with useful regression and actual artifact source-exclusion check.
- Supported Node 22.23.1: 15 focused files / 91 tests passed, including existing embedded lifecycle/preview-store suites. Scoped ESLint and shared/core builds passed. Actual SDK/Chromium copied-artifact proof passed; transport/framework matrix remains slice 14.
