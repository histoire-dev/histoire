# Slice 10 — Existing browser tests as MCP jobs

## Outcome and prerequisites

Run existing Histoire story/variant tests in dev with project Vitest and existing lifecycle semantics. MCP/UI server-triggered requests share service from 08 and receive exact summaries. Depends on 03 and 08. Deployed tests use compiled embedded preview engine in 13; do not import this project/Vite runner into production bundle.

## File ownership

- Modify `packages/histoire/src/node/{test/types.ts,test/run.ts,story-collection/types.ts,story-collection/browser.ts,util/vitest-run.ts,vitest-browser-cleanup.ts,server/dev-events.ts}`.
- Add `packages/histoire/src/node/test/{execution-service,context-snapshot}.ts` as small adapters, reusing runtime execution service.
- Add `packages/histoire/src/node/mcp/operations/{tests,test-results}.ts` and test starter registration.
- Extend worker finite dispatcher and operation resource paging.
- Add `packages/histoire/src/node/__tests__/mcp/{test-operations,test-cancellation}.spec.ts`.
- Extend existing `server-dev-event.spec.ts`, Vitest retry/cleanup, test targeting, and lifecycle tests rather than copy them.

## Tests first

1. Real story/variant targeting produces expected existing Histoire summary; same variant ID in different stories never cross-selects. No-test story completes with total 0; invalid target fails before runner.
2. Server-triggered UI fallback A, MCP B, UI fallback C execute serially with own filters/summaries; one rejected job does not wedge lane. Existing WS replies still go to requesting client/requestId. Normal tab-local embedded tests retain existing iframe execution path.
3. Live ctx story/Markdown arrays are neither rescanned nor replaced/appended by MCP/UI run. HMR during test collection cannot mutate captured run target.
4. Cancellation while queued, during browser collection, during Vitest startup/test, and during cleanup stops owned work, cleans specs, suppresses retry, and leaves lane usable only when teardown is confirmed.
5. Test body/hooks with explicit timeouts retain embedded lifecycle ownership; tracked assertion timeout remains single failure. Do not add another per-test deadline in MCP.
6. Missing dependencies/uncollected target/runner crash are explicit failures; failed assertions are completed operations with summary.ok false. Large summaries retain aggregate counts and all failure information through paging.
7. Unknown/stale run returns no unrelated last summary. RequestKey retry cannot start second Vitest run.

## Implementation steps

1. Test executor captures stable catalog revision and validated story/scoped variant before queueing. Entire project run is disallowed in v1. Call existing `runHistoireTests` with storyId, optional variantId, and `skipStoryScan: true`; no rawVitestArgs from MCP.
2. Build detached run context preserving config/plugin function references of captured generation and cloning selected server file metadata plus linked Markdown graph. Do not JSON-stringify Context or copy live class handles. Browser collection already supports `applyToContext: false`; retain that invariant and avoid module-global findAllStories.
3. Extract common `enqueueHistoireTestRun` adapter used by dev-event UI and MCP callback. Remove local testRunChain from `server/dev-events.ts`. UI adapter waits its own job and keeps existing payload/WS response contract. Queue-full error follows current error response path.
4. Add optional AbortSignal through RunHistoireTestsOptions, browser collection options, and runVitestAttempts. Check at every admission/setup/start/read/retry boundary; attach active runner cancellation/close through documented pinned Vitest API.
5. Aborted setup/createVitest still needs observed completion and cleanup of late-created handle. A Promise.race alone is insufficient. Keep lane owned until setup/runner cleanup settles or exact owned processes terminate.
6. Preserve existing browser-crash retry for non-aborted runs only. Use existing per-run temp directories/spec cleanup and shared default collection/run timeouts. MCP job records reflect runner phase failure; no new inner test timeout override.
7. Extend cleanup helper to report typed outcome (graceful completion, confirmed forced termination, or unconfirmed teardown). Existing non-MCP callers may retain best-effort behavior; shared execution service treats unconfirmed teardown as execution unavailable until full process restart. Existing helper currently warns/returns even when browser cannot be killed, so its return alone is not proof of safe lane reuse.
8. Sanitize result errors once: drop raw, bound message/stack/diff, replace canonical root prefix and token, retain names/storyId/variantId/counts/uncollectedStories. Return engine:project-vitest. Keep full bounded case collection in operation store and expose paged operation resource (offset/limit max100) under same byte cap; sanitizer/paging is reused for built-preview results in 13.
9. Page/truncation metadata makes aggregate summary and detailed cases distinguishable. `truncated: true` means poll embeds subset, not lost test outcome; operation resource yields remaining sanitized cases. Oversized single case is summarized with explicit truncation diagnostic and retained aggregate failed count. If entire sanitized result still exceeds 4 MiB, fail RESULT_TOO_LARGE with bounded aggregate counts; do not retain unlimited cases or automatically rerun already-executed tests.
10. Recheck active epoch/revision before storing result. If project changed mid-run, do not present success as current revision; finish failed STALE_REVISION and retain bounded diagnostic describing completed-but-stale execution.

## Acceptance and validation

Run test operation/cancellation/queue suites, existing UI server test-event tests, targeting/uncollected/browser cleanup/retry suites, and embedded test lifecycle tests. Then actual Chromium story suite with normal, failing, skipped, no-test, and explicit-timeout cases. Rebuild shared package before focused lifecycle tests to avoid stale declarations/runtime. Core build and focused lint required.

## Non-goals and handoff

No second test runner, shell-spawned arbitrary CLI, custom test scheduler inside iframe, watch mode, project-wide run, snapshots update, or per-test name filtering. Handoff includes exact cancellation API/proof, UI parity, zero live-context mutation, and typed cleanup outcome.

## Implemented handoff (2026-10-02)

- `test/context-snapshot.ts` clones selected plain story/tree/Markdown metadata, including nested frontmatter and tree paths, while preserving config/plugin function references. `test/execution-service.ts` exposes `createHistoireTestTask` and `enqueueHistoireTestRun`; UI requests and MCP starters share controller's FIFO service. Old `testRunChain` removed; obsolete generation WS replies suppressed.
- `registerDevTestExecutor` in `mcp/operations/tests.ts` is installed by dev HTTP and stdio worker runtimes. Exact story/optional variant target runs with `skipStoryScan: true`, detached context, `signal`, and `strictCleanup`. No caller Vitest arguments or project-wide MCP run.
- `RunHistoireTestsOptions` / browser collection options now propagate `signal` and `strictCleanup`. `util/project-vitest.ts` loads target project's own Node API. Preflight and capability checks use same project dependency resolution. Abort checks surround setup, late observed `createVitest`, collection/read/start/retry. Active-start cancellation clears whole-run safety timer; abort prevents retry.
- `cleanupVitestBrowserRun` returns `{ status: 'graceful' | 'forced' | 'unconfirmed' }`. Forced cleanup captures owned child before provider clears browser, reuses `util/playwright-cleanup.ts`, confirms process termination and Vitest teardown. Strict controller runs reject `ExecutionError('CLEANUP_UNCONFIRMED')`; shared scheduler permanently blocks lane. Dynamic project capabilities preserve metadata/read access while reporting execution unavailable with restart reason.
- `sanitizeMcpTestSummary(summary, { root, secret? })` is shared built-preview handoff for slice 13. Explicit wire projection drops raw/cause/matcher objects; bounded strings redact canonical project root and token. All normal case errors retained, oversized cases summarized explicitly to fit resource page, aggregate counts preserved. Full result retained incrementally under 4 MiB; overflow fails `RESULT_TOO_LARGE` with bounded counters. Existing operation store handles dedup, stale revision, paging, and retention.
- Vitest's global `process.exitCode` is restored after server-owned test run; assertion failures remain completed operations with `summary.ok: false`, and do not poison dev/stdio process exit. CLI `histoire test` still assigns failure exit from its summary.
- Reusable real Vue fixture: `src/node/__tests__/utils/mcp/browser-test-project.ts` covers normal assertion, fail, skip, explicit 30 ms body timeout, cancellable body, and separate no-test story sharing variant ID `normal`. No extra per-test MCP timer.

Validation: focused cancellation/context/sanitizer/UI/targeting/lifecycle/spec/cleanup suites; core TypeScript build; focused ESLint (zero errors, two pre-existing console warnings). Real Node 22.23.1 / Vitest 4.1.10 / Chromium fixture produced normal 3 passed + 1 skipped, fail 1 failed + 2 passed + 1 skipped, timeout 1 failed + 2 passed + 1 skipped, and no-test total 0. Live story metadata and Markdown count remained unchanged. Owned Vite middleware marker confirmed slow test body had started before cancellation; operation reached `cancelled`, lane stayed available, subsequent normal run completed successfully, fixture removed, and process exited naturally with code 0.
