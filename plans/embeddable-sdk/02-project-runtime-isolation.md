# 02 — Project runtime isolation

## Outcome and prerequisites

Depends on: 01.

Two project roots coexist in one Node process without story/config/listener/temp cross-talk. Reuse canonical lifecycle under Node runtime as defined in [coordination](coordination.md). Inspect actual landed MCP services before creating files.

## Owned files

- Extend packages/histoire/src/node/{context.ts,stories.ts,markdown.ts,plugin.ts} and config loading/default/Vite configuration modules.
- Replace mutable TEMP_PATH consumers in node/alias.ts, util/temp-paths.ts, collect/index.ts, vite/core-plugin.ts, and plugin temp-output creation with captured root/operation paths.
- Add or extend packages/histoire/src/node/runtime/{types,controller,start,config-watchers,cleanup,registry,events}.ts.
- Adapt packages/histoire/src/node/server/{index,collect,dev-events}.ts and server Vite creation helpers to controller ownership.
- Extend existing plugin API types with resolved root/context access; preserve hook signatures and invocation sequence.
- Update built-in token plugin root resolution and packages/histoire-plugin-svelte/src/index.node.ts aliases/client paths.
- Update packages/histoire-plugin-nuxt/src/index.ts: `loadNuxt` currently omits `cwd`, so Nuxt resolves process cwd. Pass resolved project root through the plugin API. Nuxt projects stay one per process (not a multi-root claim); document it.
- Runtime lifecycle modules (runtime/{types,controller,start,config-watchers,cleanup,execution-service}.ts) already landed with MCP work; extend them, do not recreate. Only registry/events are new.
- Add src/node/__tests__/embed/project-isolation.spec.ts, runtime-lifecycle.spec.ts, and temp-ownership.spec.ts using shared slice-01 fixtures.

## Tests first

1. Create two roots with same story/variant IDs but different config, Markdown, plugin output, and state. Collect/update/close one without changing the other.
2. Launch from unrelated process cwd; assert explicit root reaches Vite config, project plugin resolution, Svelte aliases, temp output, and built-in token generation.
3. Inject failure at config resolution, collecting Vite server, client server, watcher, initial scan, and collection. Assert already acquired resources close once in reverse order.
4. Close during collection, request concurrent restarts, and deliver delayed old-generation success. Closed/replaced generation cannot publish ready/catalog or retain timers/watchers.
5. Run concurrent build/test/dev captures for same root. No operation empties another operation's active generated directory.
6. Launch the Nuxt 4 example through the Node API from an unrelated cwd with explicit root; Nuxt config, layers, modules, and auto-imports resolve from that root (factory H1/H20, [factory requirements](../factory-requirements.md)).

## Implementation steps

1. Replace module-global story context and event listeners with context-owned registries/subscriptions. Every registration returns scoped disposer; do not keep global active root.
2. Thread resolved root through all config/plugin/path consumers. Resolve relative configFile against root, not cwd; use absolute module resolution based on project.
3. Keep plugin hook calls compatible. Add explicit resolved-root/context access through existing API object rather than changing positional arguments.
4. Introduce controller generation/state with owned-resource stack. Register disposer immediately after acquisition; await cleanup on failure.
5. Preserve collecting-server then client-server creation order required by Nuxt. Do not parallelize those two Vite acquisitions.
6. Define initial readiness after story scan, Markdown association, and collection settle. Keep empty successful project distinct from failed initialization; slice 03 attaches completed catalog publication.
7. Serialize restart transitions. Coalesce overlapping restart requests into one active restart plus necessary follow-up when config changed again. Capture generation in every asynchronous callback.
8. Mark generation inactive before teardown awaits. Stop publication first, close collection/workers, timers/watchers/listeners, then Vite servers; cleanup idempotent even after partial startup.
9. Allocate separate temp/generated paths per operation/generation. Shared immutable cache may be reused, but mutable plugin/client output is not shared. Cleanup only captured directory.
10. Keep process signal handlers, cwd changes, install/exit behavior out of generic controller; CLI adaptation in slice 04.

## API changes

Internal Context gains project-owned registry/events/lifecycle identity and resolved-root access. Public plugin extension is additive. Node project lifecycle contract remains [public-api.md](public-api.md); this slice prepares ownership, not public managed-server wrapper.

## Failure paths

Invalid config or startup failures reject readiness and unwind owned resources. Close wins over pending initialization/restart; stale completion is observed but cannot publish. Cleanup errors retain diagnostics without skipping remaining disposers. External caller resources never enter owned-resource stack.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter histoire build
pnpm --filter histoire test src/node/__tests__/embed/project-isolation.spec.ts src/node/__tests__/embed/runtime-lifecycle.spec.ts src/node/__tests__/embed/temp-ownership.spec.ts
pnpm --filter histoire test
pnpm run lint
~~~

Run two real Vue project fixtures simultaneously, plus Nuxt sequential-start regression. Mock-only tests do not satisfy coexistence gate.

## Acceptance criteria

- Two roots coexist with overlapping IDs and zero cwd mutation or cross-talk.
- Partial startup, close/restart races, timers/watchers, and temp ownership verified.
- Existing Vue/Svelte/Nuxt hook behavior retained.
- Shared controller can be consumed by Node SDK and MCP without another lifecycle engine.

## Non-goals

Middleware/public Node entry, portable catalog projections, browser bridge, Node production artifact implementation, and MCP worker architecture changes.

## Handoff

Record controller generation/readiness/cleanup API, root threading, context registry access, and precise remaining framework limitations. Slice 03 attaches atomic publication; slice 04 wraps same controller for hosting. Flag shared MCP edit hotspots without modifying its planning pack.
