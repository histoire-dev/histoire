# Slice 08 — Operation jobs, ownership, and cancellation

## Outcome and prerequisites

Execution tools admit bounded jobs and return immediately. Server-triggered UI fallback tests and MCP browser work share one lane; existing tab-local embedded tests keep their iframe sessions. Exact request ownership survives retries, cancellation, and config restart. Depends on 02 and 05; real screenshot/test bodies arrive in 09/10.

## File ownership

- Add `packages/histoire/src/node/runtime/{execution-service,execution-types}.ts`.
- Add `packages/histoire/src/node/mcp/operations/{store,admission,ownership,retention}.ts`.
- Add `packages/histoire/src/node/mcp/server/operation-tools.ts` and extend factory/resources.
- Extend worker protocol/dispatch from 06 when available; keep changes to finite method registry.
- Add `packages/histoire/src/node/__tests__/mcp/{operation-queue,operation-ownership,operation-retention}.spec.ts`.

## Tests first

1. Two distinct requests targeting different variants get distinct results in FIFO order. Same requestKey/same normalized parameters returns same job; different parameters conflict without executing again.
2. Lost admission response plus retry reconciles same job. Cancellation of protocol admission does not imply accepted operation vanished.
3. Queue limits reject before execution; cancelled queued work is removed. Active cancellation enters cancelling and does not release lane until cleanup completes.
4. Failure/rejection cannot wedge lane. Completion/cancellation race permits one terminal result; late callback cannot overwrite terminal status.
5. Principal, root/epoch, random handle checks reject foreign/stale records without disclosing existence. Polling never returns another request's summary.
6. Restart/close cancels queued and active jobs; generation-inactive completion cannot publish. Retention bounds do not evict active work or another controller's artifacts.
7. Simulated UI and MCP work share lane. Missing screenshot/test executor does not advertise/start unsupported tool.

## Implementation steps

1. Execution service owns one FIFO lane per active project and accepts typed work callbacks with AbortSignal/captured runtime. Keep queue algorithm independent of SDK. UI can await its own callback result; MCP adapter stores operation metadata around same service.
2. Job store is controller-owned and survives request-local SDK factories. Record principal/projectId/epoch/revision/tool/normalized parameters/requestKey before scheduling. Admission and deduplication must be atomic within event loop, before any await.
3. Use >=128-bit random job IDs and exact map lookup. No global list-jobs tool. Shared HTTP bearer is same principal; random handle possession is required for read/cancel. Stdio uses per-parent-lifetime principal.
4. Store bounded deduplication tombstones until 10 minutes after terminal state. If record/artifact evicted by count/byte pressure, same requestKey returns `OPERATION_NOT_FOUND` with expired-result detail instead of reexecuting. After tombstone expiry, old key can create new execution; callers must not blindly retry then. Recommend UUID keys and publish exact retry window.
5. Revalidate captured revision/target when lane starts. On success, revalidate generation/revision before storing result. Mark stale work failed, discard unpublishable artifacts, and keep original error if teardown also reports failure.
6. Wire get/cancel tools and operation resource. Read/cancel validates principal/epoch/capability before touching callback. Cancellation is best effort until runner cleanup confirms terminal stop; not an optimistic UI success.
7. Abort signal listeners/timers are job-owned and removed in finally. Observe abandoned promises to avoid unhandled rejection. Do not automatically retry jobs after unknown execution outcome.
8. Enforce queue/result/artifact limits from contracts. Separate active records, terminal retention, and request-key tombstones so memory remains bounded. Tombstones max 100 per controller; admission returns QUEUE_FULL until expiry if retaining another would break retry guarantee.
9. Close/restart marks epoch inactive before aborting. If executor cannot confirm browser/runtime teardown, mark execution unavailable until full process restart; do not release lane into another operation against potentially live previous runner. Metadata reads remain usable.
10. Expose registration hooks for screenshot/test executors. Execution tools become discoverable when their executor exists; dependency absence remains explicit tool/domain error once feature slice lands.

## Acceptance and validation

Run queue/ownership/retention suites with fake work callbacks, then SDK get/cancel/resource tests and core build. Fake callbacks prove lifecycle contracts without substituting for browser proof in 09/10. Exercise concurrent admission and shuffled completion order. No resource leaks or unhandled rejections.

## Non-goals and handoff

No protocol task extension, persistent job database, automatic job replay after restart, arbitrary callable registration, or multi-project scheduler. Handoff includes one execution service API, store invariants, shutdown-unavailable state, and request retry contract.
