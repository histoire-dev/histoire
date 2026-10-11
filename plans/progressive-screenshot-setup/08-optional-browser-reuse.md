# 08 — Optional browser process reuse

Prerequisite: [07](07-conformance-and-docs.md). Optional M4; do not block simpler setup release on pooling.

## User outcome

Repeated screenshots avoid browser process startup while every capture still receives a fresh isolated context. First capture and dependency installation remain governed by accepted setup chain.

## Config extension

Add later optional fields to both variants of `HistoireBrowserConfig` through a shared base type:

```ts
/** Shared browser process reuse options. */
interface HistoireBrowserReuseOptions {
  /** Runtime optimization; disabled unless requested. */
  reuse?: boolean
  /** Idle process lifetime in milliseconds; default 30000 when reuse is true. */
  idleTimeoutMs?: number
}
```

Reject non-integer timeout and values outside 1000–300000. If `reuse` is false, reject supplied timeout rather than silently ignore it. Default remains fresh process until real measurements and cleanup proof support a separate change to default.

For Node artifact, initially keep reuse off; add trusted startup options/environment only after parity is defined and tested. No build-machine live process/pool serialized.

## Owned files

New `runtime/browser/setup/pool.ts` and focused pool tests. Extend owner/lease/session/config modules; owner generation cleanup paths and existing cancellation fixtures. Keep pool state private to setup owner and selected driver/source/policy.

## Design

1. Pool exactly one owned browser per source owner. Existing FIFO execution lane already prevents overlapping capture jobs; no parallel pool scheduling needed.
2. Setup selection/probe launches lazily. Successful first browser becomes pooled. Release destroys per-operation context/page/nonce lease, while owner retains healthy process.
3. Preserve session's deadline and `isActive` checks. Cancellation closes active context and joins its cleanup; next job cannot start until confirmed context teardown.
4. When context cleanup is uncertain, stop admission, close/kill the exact browser via existing helpers, and preserve existing quarantine rules. Pool reuse never makes unknown cleanup safe.
5. Browser crash/disconnect invalidates pool/ready receipt. Current capture fails normally; a later explicit operation can reacquire through accepted candidate chain. Never replay story work invisibly in another renderer.
6. Idle timeout starts only after release and is cancelled before acquisition. If idle close races acquisition, await close then acquire once. Every operation has idempotent lease release.
7. Configuration restart/source retirement marks pool unavailable synchronously, drains active work, closes process, and suppresses stale snapshots. Do not share across project roots, epochs, drivers, explicit policies, or independent sources.
8. Neutral probe uses disposable context. Actual story context always new: no cookies/cache/storage, locale/viewport/DPR/global state, JS module state, or timers carried across captures.
9. Inspection/compiled tests can use same owner only if their per-context lifecycle is proven. Preserve test styles/timezone behavior; no capture-specific CSS leaking into later test context.

## Tests first

- Two captures use one browser launch and two fresh story contexts; no cookie/localStorage/DOM contamination in second capture.
- PNG/WebP, DPR, fonts, transparency, and props remain correct with pool enabled.
- Cancellation waits for active context close but does not destroy unrelated queued operation ownership.
- Context cleanup fails: exact owned process closes, lane quarantines, no later reuse.
- Idle close/acquire race launches once and never returns closing browser.
- Crash during capture returns failure, later fresh request reacquires without story replay.
- Shutdown/restart during acquisition closes late browser and prevents cross-generation retention.
- Reuse disabled retains existing one-process-per-capture behavior.

## Measurements

Use bounded cold/repeated/batch samples in acceptance environment. Record browser launch counts, elapsed medians, idle memory, and teardown. Fresh contexts mean assets can still reload; do not promise removal of Vite/story startup cost.

## Acceptance

Accept only when repeated capture startup improves and all isolation/cleanup gates pass. Pool introduces idle RAM tradeoff; report it. If benefit is small or cleanup unsafe, retain fresh-process default and defer optimization while M3 remains accepted.

## Handoff

Separate performance receipt from setup receipt. Do not label progressive enablement incomplete merely because optional pooling remains off.
