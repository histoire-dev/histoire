# 02 — Startup progress and restart reasons

Status: **complete** (2026-11-04, see evidence). Dependencies: [01](01-runtime-bridge-and-output.md).

## Goal

Report real startup/collection work and restart cause while preserving stable listener and owned cache reuse.

## Source targets

- `packages/histoire/src/node/runtime/{start,types,dev-session}.ts`, `context.ts`.
- `packages/histoire/src/node/server/{index,vite-servers,collect,client-ready}.ts`.
- `packages/histoire/src/node/collect/catalog-cache.ts`, `vite/optimizer-cache.ts`, and current optimization/config seams.
- `packages/histoire-dev-proxy/src/index.ts`, `config/watcher.ts`, child adapter and progress DTOs.

## Implementation steps

1. Add optional internal progress observer through context/runtime/server options. Emit around actual work; absence is inert. Keep Node/SDK consumers compatible and do not add a public plugin terminal API.
2. Report config loading, Vite acquisition, story/Markdown scanning, plugin hooks, cache restoration/collection, warmup, service attachment. Distinguish parallel tasks instead of inventing a linear percentage across overlapping work.
3. Reuse collector loaded/total counts. Share one producer with existing browser progress where suitable; do not observe by scraping stdout or start another collector. Record monotonic phase duration and active label.
4. Preserve failed phase and generation; stop progress publication immediately when superseded. Cached ready path may finish before background revalidation, which remains separately labelled.
5. Carry source supplied by config watcher to parent restart observation. Separate manual, browser request, config/dependency edit, crash, and fresh restart reasons. Avoid emitting two identical lifecycle notices for one transition.
6. Implement one-shot fresh restart input. After winddown, next generation skips catalog restoration and forces dependency optimization via existing configuration, without globally disabling future cache reuse.
7. Preserve fresh request while coordinator coalesces concurrent restart causes. Root/base/port/MCP policy stay owned by existing lifecycle.
8. Use owned cache claims and current per-context paths. Never remove another live context's cache, generated plugin data, or baseline directory.

## Useful tests

- Hold real config on external gate: URL/listener remains usable and progress names config wait. Release and assert subsequent meaningful phases.
- Fail config or plugin acquisition: correct phase/failure remains; correction reaches ready on same public URL.
- Edit config dependency versus manual restart: distinguish reason/source without duplicate notice.
- Real cache reuse/fresh generation scenario proves bypass/force actually affects work, then next ordinary restart can reuse cache again. Another context's owned marker/cache survives.
- Retired progress and background revalidation cannot report successor ready or trigger another restart.

## Acceptance criteria

Plain diagnostic observer explains current work, elapsed phase, counts, and restart cause. Fresh restart is one-shot, preserves ownership, and does not weaken early-bind/recovery checks.

## Exclusions

No speculative whole-startup percentages, browser request timeline, config-key semantic diff, or deletion of all project caches.

## Handoff receipt

Record added observations, actual phase/cache tests and monotonic timing boundary in [evidence](evidence.md). Note any phase with no meaningful denominator. 03 consumes actual observed events, never hard-coded inferred milestones.
