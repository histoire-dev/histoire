# Slice 09 / Tests execution / inspector collection / virtualization review

Fresh read-only review, 2026-10-04. Four confirmed P2 findings. Existing focused suites pass; five expected-behavior probes fail. No repo source/docs/Git writes, builds, typechecks, browsers, Cypress, or server launches.

## Scope and evidence

Read current `plans/ui-redesign/{README,architecture,contracts,09-tests-pane,design-reference}.md`, relevant historical review/validation context, Tests pane light/dark/component PNGs, provider model/adapters, native controller/panel, inspector/frame status consumers, collection/catalog producers, dev event/test execution lane, Vitest configuration, and current focused tests. Historical closures/counts are context only.

Inspected code includes:

- `packages/histoire-app/src/app/components/panes/tests/{model,execution,projection,dev-runner,types}.ts` and Tests pane SFCs.
- `packages/histoire-app/src/app/standalone/tests.ts`, `components/inspector/StoryInspector.vue`, `components/canvas/CanvasFrame.vue`, `components/lists/WorkbenchVirtualList.vue`.
- `packages/histoire-vue/src/tests/{controller,model}.ts`, `components/tests/HistoireTests.ts`, `foundation/VirtualList.ts`.
- `packages/histoire/src/node/{server/dev-events,server/collect,test/execution-service,runtime/execution-service,runtime/catalog/publication,runtime/catalog/attachment,vite/core-plugin,virtual/embed/tests}.ts`, isolated runner, generated specs/results, Vitest browser config.

Commands below used Node 24.16.0 / pnpm 10.33.0 PATH and `--maxWorkers=2`.

1. `pnpm --filter @histoire/vue exec vitest run src/__tests__/workbench-tests.spec.ts src/__tests__/workbench-tests-bulk.spec.ts src/__tests__/standalone-tests.spec.ts src/__tests__/tests-controller-lifecycle.spec.ts src/__tests__/tests.spec.ts src/__tests__/virtual-list.spec.ts src/__tests__/virtual-list-dynamic.spec.ts --maxWorkers=2`
   - **7 files / 27 tests passed.** `/tmp/histoire-ui-review-round-2/tests-baseline-vue.log`.
2. `pnpm --filter histoire exec vitest run src/node/__tests__/workbench-test-runner.spec.ts src/node/__tests__/server-dev-event.spec.ts src/node/__tests__/test-execution-provenance.spec.ts src/node/__tests__/test-specs.spec.ts --maxWorkers=2`
   - **4 files / 20 tests passed.** `/tmp/histoire-ui-review-round-2/tests-baseline-node.log`.
3. `pnpm --filter @histoire/vue exec vitest run --config /tmp/histoire-ui-review-round-2/tests/vitest.config.mjs --maxWorkers=2`
   - **1 file / 7 tests: 5 expected-behavior failures, 2 passes.** `/tmp/histoire-ui-review-round-2/tests-probe.log`.
   - Probes: `/tmp/histoire-ui-review-round-2/tests/probe.spec.ts`; config: `/tmp/histoire-ui-review-round-2/tests/vitest.config.mjs`.
   - Temporary probes reuse existing source/session/catalog/viewport fixtures. Real controllers, projections, SFCs, recycler, catalog and execution lane. Runner invocation mocked; no browser/process started.
   - Early probe setup used invalid non-SHA runtimeRevision strings; corrected to valid 64-character hex values before final results. Early nested-component action access used public proxy instead of `$exposed`; corrected before final two passing virtualization checks. Those setup failures are not findings.

Total current focused baseline: **11 files / 47 passing tests**. Temporary probes remain separate from that count.

## Confirmed findings

### T1 — [P2] Invalidate completed cache on changed executable publication

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/tests/model.ts:75-78`.

Revision change calls `cancel(false)`, which marks only current server targets stale (`model.ts:67-69`). Completed entries keep old collection/summary with `stale: false`; no executable digest comparison queues Watch. Exact HMR event is sole path through `invalidate` (`model.ts:117-125`). Full collector update populates no `changedStories` (`server/collect.ts:167-192`); only targeted branch populates them (`:153-163`), and loop at `:203-205` therefore announces none after full recollection. Full recollection can come from subsequent `histoire:mount` (`vite/core-plugin.ts:159-164`), Markdown/full inventory changes, or catalog resynchronization after missed HMR.

Trigger: completed run, then same source/epoch publishes new source revision and changed story `runtimeRevision`, without separate exact story event. Same target tuple still exists.

Observed probe 1: affected entries remain non-stale (`expected false to be true`); prior pass still counted as current. Probe 2: Watch enabled, changed executable digest published, `runStory` calls **0**.

Impact: stale success/failure/definitions remain in project summary/filter/frame chips and are eligible for inspector host cache. Inspector trusts model's stale bit (`StoryInspector.vue:32-39`), so new source can display old run as current. Watch silently misses affected targets.

Expected: changed executable story entries become outdated; stale results excluded from current pass/fail counts. Watch queues affected story once after ready publication. Explicitly unchanged digests may retain results across unrelated publications; missing digest must use conservative policy.

Ownership/fix: project tests model owns per-story executable digest/publication comparison; reuse `invalidate` and existing pending/epochs machinery. Do not depend exclusively on transport HMR notification. Preserve source/epoch reset and unchanged-digest behavior.

Useful regression: successful/failing completed run; new catalog revision with changed digest, no exact event; verify stale summary, hidden inspector cache, one Watch admission. Companion unchanged-digest unrelated revision must not invalidate/re-run.

### T2 — [P2] Stop must cancel server handle, not only browser publication

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/tests/dev-runner.ts:19-25`.
Related server location: `/home/akryum/Projects/histoire/packages/histoire/src/node/server/dev-events.ts:38-43`.

Abort rejects browser promise but sends no cancellation; server discards `ExecutionHandle` by returning only `.result`. `TestsPanel.vue:41-42` exposes this as Stop; model immediately returns to non-running and allows another Run all.

Trigger: Run all, Stop during run, Run all again, Stop queued replacement.

Observed real-adapter/real-lane probe: `{ serverAborted: false, queued: 1 }`, expected `{ serverAborted: true, queued: 0 }`. Both browser promises reject `CANCELLED`; first server runner still owns non-aborted signal, second remains queued until test's explicit lane close.

Impact: Stop/HMR/component teardown continue costly project workers, block shared UI/MCP lane, and can accumulate invisible queued runs until queue capacity is exhausted. Existing FIFO prevents overlap but does not cancel work.

Expected: browser cancellation addresses exact socket-owned server request/handle. Active signal aborted; waiting job removed before acquiring worker. Keep execution lane until actual cleanup confirms completion.

Ownership/fix: dev-channel adapter + Node dev-event handler. Retain per-client correlated handles, expose finite cancel event/options, cancel on originating request abort/socket retirement, and clear handle table on settlement. Never allow one client to cancel another client's job.

Useful regression: integrated channel/real lane/blocked runner; Stop aborts correct active signal, Stop queued request removes it, other client's admitted job unaffected, successor starts only after cleanup.

### T3 — [P2] Reject queued UI work after catalog owner retires

Primary location: `/home/akryum/Projects/histoire/packages/histoire/src/node/test/execution-service.ts:26-29`.

UI admission captures metadata/catalog in `createHistoireTestTask` (`:12-13`) but head-of-lane `validate` checks only runtime `isActive()`. Catalog replacement in same runtime leaves queued request valid. Isolated worker later imports live files, while result provenance is stamped with captured prior revision (`:17-20`). SDK HTTP route already uses stricter captured-catalog identity (`virtual/embed/tests.ts:26-27`); UI path bypasses it.

Trigger: occupy shared lane, queue Run all, modify physical story file and publish new catalog revision in same active runtime, release lane blocker.

Observed real-lane/real-catalog probe: retired UI request invokes `runHistoireTests` **1** time instead of rejecting before runner. Fixture writes changed bytes under its temporary project and publishes newer catalog; runner is mocked, so actual browser evaluation of new bytes remains outside this proof.

Impact: obsolete cancelled/stale UI admissions still acquire collection/browser worker after source replacement, possibly target removed variants and attach old provenance to later live-source evaluation. Browser model suppression does not repair server admission ownership.

Expected: reject stale or updating captured source before worker acquisition; preserve queue teardown ordering. Do not emit obsolete summary under captured revision.

Ownership/fix: test enqueue/task boundary with generation-owned catalog. Capture catalog identity and reject if publication changed or updating; apply equivalent pre-/post-run ownership checks used by SDK route. Preserve typed cancellation/stale codes over dev transport so expected retirement does not display as transport failure.

Useful regression: blocked shared lane, enqueue under revision A, publish B/change source bytes, release blocker; runner never starts and request returns typed stale retirement. Companion unchanged current publication succeeds.

### T4 — [P2] Keep collapsed collection-failure group discoverable

Primary location: `/home/akryum/Projects/histoire/packages/histoire-app/src/app/components/panes/tests/TestsTree.vue:28-41`.

All-not-collected groups omit heading (`:28`), yet children still obey previous `closed` state (`:41`). Group previously collapsed with normal variants then converted to all collection/transport errors has neither visible children nor disclosure control.

Trigger: All filter, collapse story, subsequent project transport/collection failure marks every variant `notCollected`; switch/use Failing.

Observed production SFC probe: two actual projected not-collected rows exist, but pane displays **`No failing tests`** and contains no button to reopen group.

Impact: collection failures disappear; Failing pane claims no failures. Can recover only by remounting pane or later successful results that restore heading.

Expected: show not-collected diagnostic rows regardless previous collapse when no heading exists, or retain actionable heading/disclosure for known grouped story.

Ownership/fix: TestsTree flattening. Collapse applies only where disclosure is rendered; keep diagnostic identity and virtualization keys intact.

Useful regression: collapse group, update same story to all collection errors, assert diagnostic text/selectable row or disclosure remains; recover to normal results and verify collapse behavior and exact target activation.

## Verified boundaries without additional confirmed defect

- Bulk project run uses one server admission; Watch uses one affected-story worker; SDK source selection remains unchanged. Assertions retain exact tuple attribution even repeated test IDs across variants. Existing explicit owner/cancellation tests pass.
- Collection definitions, skipped/todo counts, stale count, transport/collection diagnostics and assertion failures are separately represented by model/projection; existing focused baseline verifies these paths.
- Automatic standalone collection checks ready source/target/runtime ownership and catches rejection; controller resets old target/source states on navigation/readiness/source change. Current readiness-return and synchronous cancellation regressions pass.
- Shared recycler guards inactive/reassigned slots and keys row subtree by exact identity. Existing fixed/dynamic 1000-row focus/reveal/removal/unmount/density tests pass.
- New production TestsTree probe: 1000 stories, distant Variant 999 focus/click activates exact tuple, bounded mounted controls (<35), then filtered replacement activates exact Variant 500. Passed.
- New native inspector test-definition probe: 1000 definitions, delayed native scroll, dynamic reveal of test-999 returns exact `Suite > Test 999 — Not run`; mounted rows stay <35. Passed.
- Test-run Vitest config leaves file parallelism to Vitest; collection-only config explicitly serializes side-effectful collection. No measured throughput claim.

## Limits / concerns not counted as findings

- No real browser/project test runs, cross-framework acceptance, static bundle inspection, process cleanup/throughput measurements, builds or typechecks. Parent owns those actions. Baseline uses workspace package builds for some shared SDK/protocol imports; temporary project/session API is imported from SDK source.
- TestsPanel selection rejection catch (`TestsPanel.vue:33`) checks only component active, unlike success source/tuple guard. Shared stale-navigation-feedback pattern sent to audit_shell; not separately probed/counted here.
- Dynamic reveal wait has no local timeout but resolves on removal/new action/unmount and current delayed-scroll tests pass. No concrete hanging user path reproduced; not a finding.
- Imported component/test-helper source changes are not included in canonical story digest and core HMR collector only directly matches story file. Dependency-to-story Watch propagation needs separate actual project evidence; not claimed defective from this review.
