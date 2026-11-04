# 07 — Terminal-owned browser test service

Status: **complete** (2026-11-04, see evidence). Dependencies: [01](01-runtime-bridge-and-output.md), [02](02-progress-and-restart-reasons.md).

## Goal

Admit finite terminal test operations through existing shared server execution lane with exact target, cancellation, result, and cleanup ownership.

## Source targets

- New `packages/histoire/src/node/runtime/terminal/` tests service, operation/result projection, and batch task.
- Reuse `runtime/{dev-session,execution-owner,execution-service,execution-types}.ts` and `test/{execution-service,preflight,isolated,summary}.ts` plus existing shared summary helpers.
- Terminal bridge/types and existing real MCP/workbench browser execution fixtures. Reread concurrent test runner/progress changes before extending.

## Implementation steps

1. Create scoped terminal owner around session execution service. Terminal adapter does not instantiate another lane or require MCP to exist.
2. Validate All/Story/Variant target against current owned catalog, reject ambiguity/missing targets, capture detached metadata/revision, and create existing `createHistoireTestTask` before enqueue. All excludes docs-only/non-executable targets according to existing runner behavior.
3. Return operation identity promptly after admission. Expose queued/running/cancelling/completed/failed/cancelled, generation/revision, progress, aggregate summary, explicit omissions, and result pages. Process callbacks may not change scheduler ownership.
4. Reuse project Vitest dependency preflight, isolated finite runner, current result serializers/progress, and summary merge. No arbitrary Vitest flags, installation, retries, persistent runner, or process-global result exit status.
5. Add affected-subset batch task using captured per-story tasks sequentially within one lane submission. Call task execution directly inside batch; never enqueue nested tasks into same occupied queue. Propagate one abort signal and honor each task's validation/cleanup on success and failure. Stop batch on infrastructure failure; ordinary assertion failures remain summary data.
6. Revalidate source owner at admission, lane head, each batch stage, and final publication. Keep aggregate per-story progress meaningful rather than summing incompatible collection/run counters.
7. Cancellation acts on exact terminal operation/owner only. Keep lane occupied until confirmed cleanup. Preserve existing queue-full/unavailable/quarantine behavior; cancellation request is not terminal result.
8. Bound completed summaries/results by count and bytes; page failure details rather than pushing huge IPC messages. Preserve aggregate totals/uncollected stories and explicit truncation. Evicted result read is unavailable, never an instruction to rerun automatically.
9. On generation release cancel/join terminal submissions, dispose observers, and suppress late results. Parent retains historical summaries; unfetched retired details become unavailable as documented.

## Useful tests

- Real project browser tests with independently known pass/fail/skip totals: All, exact story, exact variant, empty/no-test and uncollected target cases.
- Two owners share one lane. Hold terminal body via external gate, queue MCP/workbench job, cancel terminal, verify other job survives and starts only after confirmed cleanup.
- Reverse owner order proves terminal cannot overtake existing work. Queue-full error remains visible and creates no hidden duplicate operation.
- Two-story subset executes both and excludes third; cancel between stories retains cleanup and no later stale success.
- Source edit/restart during held run prevents current-result publication. Missing dependencies do not install packages or stop dev server.

## Acceptance criteria

Terminal operations reuse existing execution safety with no duplicate runner/lane. Tests prove exact targets, independent owner cancellation, cleanup serialization, source fencing, and bounded result behavior with MCP disabled.

## Exclusions

No Tests UI/watch scheduling, native Vitest watch, snapshot updates, arbitrary filters, or automatic test rerun after uncertain admission.

## Handoff receipt

Record task/owner reuse, operation contracts, real browser counts, multi-owner ordering/cleanup evidence, concurrent-source adaptations, and limitations in [evidence](evidence.md). 08/09 rely on demonstrated operation semantics, not mocked executor success.
