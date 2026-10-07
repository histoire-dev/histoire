# Cross-story startup performance

## Scope and evidence

Optimize switching between ordinary stories with several live Grid/List frames. Keep one isolated document per admitted frame and preserve existing Single same-story retention. Do not reuse documents across stories, pool hidden frames, weaken runtime readiness, or change public protocol/configuration.

Source evidence: `/home/akryum/Documents/Traces/histoire/Trace-20261007T155609.json`, captured 2026-10-07. Two switches create 3 BaseButton and 11 Codegen sandbox documents. Trace records 3,807 script requests and 14 document requests, about 210 MiB encoded data, responses marked uncached. Click dispatch tasks last 201/298 ms. Sampled controls render `clientWidth` reads account for 57/63 ms; source descriptor validation for 31/88 ms. Codegen DOMContentLoaded arrives 3.1–3.9 seconds after its click; that is not host readiness. Exclude 385 ms CPU profiler startup from application cost. Do not compare these values directly with Single/Tailwind timings.

## Execution

Use `gpt-6-luna` subagents with reasoning `max`, bounded ownership below. Concurrent dirty work is present; preserve it. No stage, commit, push, resets, dependency installs, or server termination outside task-owned processes. Source files near 300 lines, JSDoc for new APIs/functions, meaningful tests before production changes, reuse existing fixtures.

1. Slice 0 captures baseline before production edits/builds. Other agents may inspect and write tests while gate is closed.
2. Slices 1–4 implement after parent explicitly releases baseline gate. Independent source ownership; coordinate before touching another slice's files.
3. Parent integrates, builds dependency order, reviews ownership/cleanup, and runs focused validation.
4. Slice 0 repeats measurements and browser checks only after final build/CPU-quiet signal.

| Slice | Owner boundary | Contract |
| --- | --- | --- |
| 0 | benchmark/Cypress/results and validation document | Comparable before/after dev+static evidence |
| 1 | sandbox generated imports, controls code-editor loading, app build inputs | Smaller initial module graph; controls and mocks remain functional |
| 2 | canvas startup scheduler and component integration | Grid/List start selected frame alone, then admitted siblings progressively by distance with at most two starts active. A null selection uses first live-admitted frame as anchor. Single bypasses queue; Matrix keeps current isolated admission path. |
| 3 | HistoireControls cached width using provider root observation and focused Vue tests | No layout reads during render; root replacement and zero-width behavior stay correct |
| 4 | SDK internal descriptor projection, source connection, frame-replica metadata | Validate immutable accepted data once without trusting public mutable input |

Slice 4 implementation now shares the SDK's branded immutable accepted descriptor across same-copy canvas replicas. Public getters remain detached; cross-copy brand misses fall back to detached metadata and full validation. Focused SDK, embed, standalone, replica, and source-revision tests pass; parent owns builds and trace measurements.

## Selected-first progressive loading

User explicitly requested selected variant readiness before loading remaining variants. Grid/List starts selected variant alone and waits for existing host readiness, including state restoration. Then remaining admitted frames start progressively by increasing geometric distance from selection, at most two concurrent starts. New selection reprioritizes queued work. Already-ready and already-started frames retain ownership; live admission and document budget stay unchanged. Missing selection uses a deterministic visible anchor. Selected failure must release the barrier after owned teardown, while Retry restores it. See slice 2 for exact lifecycle and tests.

## Acceptance

- Lower median first relevant frame readiness and lower host blocking; report p95 separately and investigate repeatable regressions.
- Record all-admitted-frame readiness too: serializing startup must not hide slower total completion.
- Script/module graph reduction is evidenced in real dev/static network captures, not inferred from source alone.
- Scheduler bounds only initial acquisition, never removes already-ready frames merely to meet concurrent-start limit; existing live-document budget and viewport admission remain authoritative.
- Session state, source invalidation, rapid navigation, Retry, inspector ownership, tests, controls, Matrix isolation and Single retention stay correct.
- No flaky latency assertions in CI. Preserve security validation at external trust boundaries and finite source-generation ownership.

See numbered slice documents for implementation and tests. Record actual results and deviations, including environmental failures, in `05-validation.md`.

## Validation snapshot

Final dev and static builds pass. Cross-story admission/A/B/A, existing Single, and Tailwind Cypress specs pass on both: 2/2, 2/2, and 3/3. Codegen/controls and direct-route Vitest, JSON, and source checks are recorded in [`01-sandbox-smoke-results.md`](01-sandbox-smoke-results.md).

Selected readiness improved in final static runs: Code gen selected p95 fell from 901 ms to 351–375 ms. All-admitted Code gen p95 rose from 952 ms to 1,298–1,433 ms in those same runs. Browser captures overlapped unrelated high CPU workloads, and the single paired frozen-baseline run under load was much slower than final runs; see [`05-validation.md`](05-validation.md) and its preserved samples for full caveats and network evidence.
