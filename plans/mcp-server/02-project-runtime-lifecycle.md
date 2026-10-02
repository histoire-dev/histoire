# Slice 02 — Owned project runtime and restart lifecycle

## Outcome and prerequisites

One controller owns startup, initial readiness, restart, and cleanup for normal dev and MCP project worker. Depends on 01. Existing two-Vite-server startup order stays intact. This slice introduces lifecycle seams; catalog DTO construction belongs to 03.

## File ownership

- Modify `packages/histoire/src/node/{server/index.ts,server/vite-servers.ts,server/collect.ts,commands/dev.ts,stories.ts}`.
- Add `packages/histoire/src/node/runtime/{types,controller,start,config-watchers,cleanup}.ts`.
- Extend `packages/histoire/src/node/__tests__/server-collect.spec.ts`.
- Add `packages/histoire/src/node/__tests__/mcp/runtime-lifecycle.spec.ts` and extend shared process/project harness as needed.

## Tests first

1. Controller is not ready merely because HTTP listen succeeded. Ready resolves after initial story watcher scan, Markdown association, collection, and module invalidation.
2. Inject failure at each acquired stage; every previously acquired server/watcher/collector closes once. Failed startup must not leak global listeners or leave pending readiness forever.
3. Rapid Vite/Histoire config edits serialize/coalesce restarts. Late startup/completion from previous epoch cannot overwrite active runtime.
4. Stop during debounce and during in-flight collection suppresses publication/messages into closed server. Close twice is harmless.
5. Existing normal dev collection order and UI HMR tests remain green. Multiple runtime instances are rejected in same project process rather than corrupting global `stories.ts` context.

## Implementation steps

1. Add controller states and captured handle:

   ```ts
   /** Runtime generation captured by a caller. */
   interface ProjectRuntimeHandle {
     /** Generation identity changes on restart. */
     epoch: string
     /** Existing project context; never serialized to clients. */
     context: Context
     /** True only while this generation owns controller. */
     isActive: () => boolean
   }
   ```

2. Extract config watcher ownership from `commands/dev.ts`. Both Vite and Histoire config watchers return disposers and participate in controller close; avoid current outer watcher surviving close.
3. Start with fresh `createContext` in worker cwd. Controller does not change parent cwd and does not start multiple root contexts in same process.
4. Extend story watcher with an explicit initial-ready promise without changing collected ID behavior. Clear delayed add notifications during close. Wait for readiness before initial collection; do not let source scans race partially populated list.
5. Extend `createServer` return with `ready` and narrow collection-status hooks. Arrange initial collect as observed promise; collection failure must settle readiness with failure/diagnostics rather than unhandled rejection.
6. Register every resource in cleanup stack as soon as acquired. Also unwind first Vite server if creating second server fails. Preserve deliberate sequential config evaluation used for Nuxt HMR.
7. Add stopped/generation guard to collector, including checks after awaits and before WS/publication. Stop unsubscribes immediately; async close waits for current work within bounded teardown.
8. Controller restart marks old generation inactive before cancellation/teardown, replaces epoch, then starts next generation. Expose restarting status while reads await new ready snapshot; no stale success feedback.
9. Normal devCommand uses controller, prints UI URLs once per successful generation, and retains existing config/open/host behavior. Reserve on-generation/close hooks for default-on HTTP integration in 07; controller accepts explicit dev-HTTP disable for stdio worker. No SDK imports here. Production controller in 12 implements same facade with built snapshot and no dev startup dependency.
10. Wire owned SIGINT/SIGTERM shutdown at command boundary; remove signal handlers on close. Worker IPC disconnect support is consumed by 06, not implemented twice.

## Acceptance and validation

Run lifecycle and server collector specs, existing `server-dev-event.spec.ts`, core build, and focused lint. Integration probe must start/stop a real Vue dev runtime twice on ephemeral loopback port and exit with no owned child/server left alive. Validate Nuxt startup order through existing tests/config path; do not claim Nuxt browser acceptance before 11.

## Non-goals and handoff

No MCP registration, HTTP auth, catalog search, new test runner, or multi-project service. Handoff includes runtime handle/controller API, readiness semantics, ownership graph, and cleanup evidence. 03 uses completed-batch hooks; 06/07 reuse controller without copying restart logic.
