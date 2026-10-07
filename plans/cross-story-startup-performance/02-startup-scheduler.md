# Slice 2: bound concurrent frame startup

## Ownership

Own small adjacent canvas startup coordinator module, canvas provider/injection seam, `CanvasReplicaPreview.vue` startup integration, narrowly needed Grid/List priority wiring and focused Vue lifecycle tests. Existing `frame-admission.ts`/`frame-layout.ts` remains source of which documents should be live. Coordinate before changing frame-replica metadata (slice 4 owns it). Keep source near 300 lines; extract coordination if component grows.

## Design

Create one coordinator per canvas provider, not a process-wide singleton. Grid/List startup begins with only the selected admitted frame. Hold queued siblings until the selected frame's host readiness completes its retained-state restoration; then fill up to two active startup slots with admitted siblings ordered by center-to-center distance from the selected frame, with original layout order as deterministic tie-break. Preserve `useCanvasFrameAdmission` as the only live-document budget and visibility authority. Never expand admission to find more work.

If selection has no admitted target, use the first currently admitted frame as deterministic anchor. `liveCanvasFrames` already puts the selected frame first when present; without selection it sorts admitted candidates by visible area then layout order. Rank remaining admitted frames by distance from the anchor center, then layout order.

Batch queue draining in one microtask after same-render requests register. Vue render order can put selected frame after earlier candidates; coordinator must see the complete batch, start selected alone, and keep other jobs queued until selected readiness settles. Selection changes re-rank queued jobs and establish a barrier for a selected frame that is neither ready nor failed. Keep already-ready sessions and already-active sibling startups running. A selected startup failure opens the barrier only after its owned work is disposed; local error remains retryable. Retry replaces that failed generation and reinstates the selected barrier. Single bypasses the coordinator so it does not wait behind retired Grid/List work and same-story retained selection does not acquire a slot. Matrix keeps its isolated sessions/props and current admission path outside this coordinator.

A job owns a cancellation token and one idempotent release. Acquire before `createCanvasReplicaSession` and connection so descriptor copying/validation is bounded too. Hold until existing host readiness observer finishes retained-state restoration, or error/disposal. No early release merely because iframe appended or mount.ready resolves before restoration. A waiting frame remains registered loading/inert without a session/document owner.

On navigation/unmount/budget eviction/retry, cancel queued work immediately. Late resolves cannot create documents or release another job's permit. Active obsolete startup must retire its session and release permit after owned teardown; source invalidation and initial timeout cannot deadlock queue. Never dispose already-ready sessions to free startup capacity. Same-story selection in retained Single session does not acquire a new startup slot.

Reuse existing readiness/failure hooks and captured lifetime guards; do not create another readiness or state cache. Teardown must release observers once. Avoid waiting on a scheduler permit while holding a permit needed for its own cleanup. Review reentrancy because granting next job may synchronously publish loading.

## Tests first

Use existing canvas lifetime fixture plus coordinator unit tests where valuable. Prove selected requested last in render starts alone, siblings remain queued through retained-state restoration, nearest admitted siblings fill the two slots first, ties preserve layout order, and a null selection uses first live admission as anchor. Cover selection changes while jobs are queued/active, selected failure and Retry, waiting/active cancellation, rapid A/B/A, teardown, stale ready/error rejection and no leaked permits. Existing Single retention, Grid/List admission/pan/zoom and Matrix isolation tests must still pass. Browser checks measure first relevant AND all admitted readiness; reduced concurrency is rejected if repeatable total completion regression outweighs responsiveness gain. Tune bounded value only from controlled evidence and document it.

## Implementation update

Implemented per-CanvasViewport coordination with optional CanvasReplicaPreview injection. `useCanvasFrameAdmission` remains sole visibility and live-document budget authority. The selected admitted frame starts alone; sibling jobs stay queued until SDK `mount.ready` and the runtime observer both confirm completion after retained-state restoration. Admitted siblings then use center-distance order with layout ties and at most two active starts. A missing selected frame uses the first currently admitted frame as its anchor.

Selection changes reorder queued jobs and install a fresh barrier for a newly selected frame without stopping active or ready siblings. Activation tokens protect A/B/A and Retry from late completions. A failed selected job keeps its slot through session disposal, then releases the queue; Retry creates a new barrier. Cancellation prunes retired scalar state, including queued jobs removed from admission. Microtask batching collects same-render requests before the first selected frame starts, and a pre-aborted callback cannot create a session.

Single and Matrix stay outside the Grid/List coordinator. Direct Single/Matrix startup owns an abort signal and settles on retry or unmount. Latest-target selection, restored-runtime readiness, and Matrix prop request/acknowledgement now live in focused lifecycle helpers. `CanvasReplicaPreview.vue` is 268 lines; the coordinator, startup lifecycle, and Matrix props helpers are 227, 197, and 94 lines.

Focused validation passed: six Vitest files, 36 tests, including coordinator admission/cancellation, ranking, Single retention/unmount, Grid/List admission, and Matrix behavior. Run from `packages/histoire-vue`:

```sh
PATH=/home/akryum/.local/share/mise/installs/node/24.16.0/bin:$PATH ./node_modules/.bin/vitest run \
  src/__tests__/canvas-startup-coordinator.spec.ts \
  src/__tests__/canvas-startup-coordinator-cancellation.spec.ts \
  src/__tests__/canvas-startup-ranking.spec.ts \
  src/__tests__/canvas-frame-lifetime.spec.ts \
  src/__tests__/canvas-single-switching.spec.ts \
  src/__tests__/workbench-matrix.spec.ts
```

Changed-file ESLint passed for the Slice 2 source, helper, and test files using the same Node 24.16.0 path. The normal `pnpm --filter @histoire/vue test ...` launcher could not start because mise reported a read-only filesystem; invoking package-local Vitest with installed Node worked. Parent owns integrated builds and browser timing; no before/after performance claim is recorded here.
