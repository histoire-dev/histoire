# Dev CLI architecture

Status: **planned**. Read [contracts](contracts.md) for behavior and [validation](validation.md) for proof requirements. Paths below are relative to repository root.

## Current source seams

Traced at HEAD `afd4ea6e` (slice 00, 2026-11-04). Line numbers are references for rereading, not stable contracts. Paths under `packages/`.

- `histoire/src/node/bin.ts:17-31` declares `dev` with Sade (`--port/--config/--open/--host/--mcp/--no-mcp/--mcp-port`) and lazily imports `commands/dev.js`. No `--tui/--no-tui/--test-watch` exist yet.
- `histoire/src/node/commands/dev.ts` is the lightweight parent: validates inputs (`:23-24`), captures credential (`:25`), calls `startDevProxy` with `runtime: dev-child.js` (`:27`). Prints `Histoire:` from `onListening` (`:27-29`), `Config changed, restarting...` and `Local:` from `onStatus` (`:30-33`) by direct `process.stdout.write`; owns SIGINT/SIGTERM (`:47-48`) and returns `close` that removes only its listeners. Runtime imports are `@histoire/dev-proxy`, `mcp/transport/http-auth`, `mcp/transport/http-options` (type-only imports otherwise); nothing from `runtime/`, Vite, or catalog.
- `histoire-dev-proxy/src/index.ts`: `listen()` binds the public port first (`:43`, `server/listener.ts:4-33`, fallback to next port on `EADDRINUSE`); `onListening` (`:114`) precedes the lazy `config` import (`:116`) and `controller.start()` (`:137`). Restart sources are unlabelled: config watcher callback (`:119`), runtime exit (`:91-96`), manual `restart()` (`:146`) reached via `POST /__histoire/dev/restart` (`server/http.ts:33-40`). `publish()` (`:54-62`) emits only `PublicState` to SSE and `onStatus`; no cause, progress, output or generation-scoped command channel exists. `open` is lazy (`:67`).
- `histoire-dev-proxy/src/process/child.ts`: `fork` with `stdio: ['ignore','pipe','pipe','ipc']` (`:30`), so the child never receives parent stdin; stdout/stderr go straight to `process.stdout/stderr` with `end:false` (`:31-32`) and are unpiped only on `close()` (`:125-126`). Messages are filtered by `isChildMessage` and `generation` (`:47-48`) and serialized through a promise chain (`:45,49`). Winddown: IPC `shutdown`, bounded wait (default 10s), process-group `SIGKILL`/`taskkill` (`:84-101,111-128`). No observer seam for output or extra message kinds yet. `src/protocol.ts` has `ParentMessage = start | shutdown` and `ChildMessage = watch | ready | failed` (`:8-15`), validated by `isChildMessage` (`:17`); package exports `.`, `./lifecycle`, `./config`, `./protocol`.
- `histoire/src/node/commands/dev-child.ts`: deletes the credential env (`:5`), loads runtime lazily after the `start` message (`:40-45`), builds `createDevSession` with `devProxy` origin/generation and config-input callbacks (`:47-61`), awaits `controller.start()`, sends `ready` (`:66`), prints `MCP:` directly to stdout (`:67`). Failures log with `console.error` and send `failed` (`:77-78`). Only `shutdown`/`start` messages are handled (`:70-80`).
- `histoire/src/node/runtime/dev-session.ts`: execution is `createExecutionOwner(options.execution)` or a fresh `createExecutionService()` (`:14`). `onBeforeRelease` runs `execution.cancelAll()`, MCP invalidation, then `attached.close()` (`:22-29`) before the caller's hook. `onGeneration` attaches the canonical catalog first (`:34`), reconciles optional MCP, runs the caller's hook (`:42`), then awaits `attached.ready`. The returned object exposes only `controller`, `execution`, `mcp`, `close` (`:46-68`); attached catalog is private, so the terminal adapter reaches it through `attachRuntimeCatalog(handle, ...)` (idempotent per handle, `catalog/attachment.ts:53-60`) or `getRuntimeCatalogForContext` (`:63`) from `onGeneration`.
- `runtime/start.ts:12-32` captures configuration revision, creates context, reports inputs (`onConfiguration`), then `createServer`. `server/index.ts` creates collector (`:116`), `restore()` then `collect()` (`:133-135`), and exposes `ready`, `collect`, `onCollection` (`:150-152`). No phase/progress events, no restart reason, and no cache-bypass option exist anywhere under `server/` or `runtime/`; these belong to slice 02.
- `runtime/catalog/publication.ts`: `publish` serializes snapshots; listeners fire only when the fingerprint changes (`:110-119`); `updating`/`executionRevision`/`markUpdating` fence execution admission (`:86-93`); `getTarget` throws while updating (`:129-132`). Collection completion without fingerprint change clears `updating` but notifies nobody (`:120`). Attachment closes with generation (`attachment.ts:44-48`).
- `runtime/execution-service.ts`: one FIFO lane, default 8 queued total and 4 per principal (`:45-46`), `QUEUE_FULL`/`UNAVAILABLE` on `enqueue`, `cancelAll` drains with cleanup deadline, unknown cleanup quarantines. `runtime/execution-owner.ts:18-67` scopes handles to one owner, `cancelAll` joins confirmed cleanup, `quarantine` is forwarded to the shared lane.
- `test/execution-service.ts:14-54` creates captured test/collection tasks and `enqueueHistoireTestRun`; `test/eligibility/{index,evidence}.ts` hold per-story dependency evidence with `owner`, watcher `since`, file set and leaf fingerprints, and broad invalidation for additions/deletions/non-module edits.
- `scripts/dev-histoire.mjs:26-82` rewrites `process.argv` for Nodemon with build watches, `--delay 1500ms`, `--signal SIGTERM`, `--exec node`, then `bin.mjs dev ...`. Nodemon pipes stdin into its child by default (`nodemon/lib/monitor/run.js:51,284-293`); only `stdin === false` hands its own `process.stdin` to the child (`:57-58`). A clean child exit waits for file changes (`:244-246`). The launcher passes no stdin option, so a TUI child under it has no TTY until slice 11 adapts this.
- `histoire/src/node/__tests__/utils/mcp/process.ts:36` spawns built `packages/histoire/bin.mjs` (`cli-project.ts:10`) with `stdio: ['ignore','pipe','pipe']`; process specs therefore run against `dist`, not source.

### Corrections to earlier planning assumptions

- (Before slice 01) Nothing in `packages/histoire/src/node/terminal/` or `runtime/terminal/` existed; `bfae3c4d` dirty edits listed in the README were committed in `afd4ea6e`. Test execution/service/worker files are no longer dirty.
- Public status carries only `PublicState`; cause, progress, output and command channels are all new work (slices 01-02), not extensions of existing fields.
- The parent never owned child stdin; terminal input exists only in the parent process and child-side terminal logic is command-driven over IPC.
- Catalog subscription alone cannot signal "collection finished"; watch and progress must also use `runtime.onCollection` (`types.ts:32`) events.

### Parent import boundary

Allowed in the early bind graph: `node:*`, the `@histoire/cli` entry, dev parent (`src/commands/dev.ts`) and terminal modules (including the light clipboard writer), `@histoire/dev-proxy` without `config/`, and exactly four histoire modules: `dist/node/bin.js`, `commands/dev-host.js`, `mcp/transport/http-auth.js` and `mcp/transport/http-options.js`. Must stay lazy: everything under `runtime/`, `server/`, `context`, `collect`, Vite, `@histoire/dev-proxy/config`, `open`, `@histoire/protocol` and `@histoire/cli/workbench-url` (loaded on first open/copy), `node:child_process` for clipboard tools, `uqr` (QR), test engine, MCP runtime. `packages/histoire/src/node/__tests__/terminal/early-bind.spec.ts` runs the built `bin.mjs dev` and records every module resolved before the first `listen`, enforcing this list.

These are observations, not claims of feature completion. Reread before edits.

## Parent ownership

Keep dev command as composition root. The parent owns public listener, terminal controller, mode policy, renderer, keyboard input, bounded output/request histories, test history summaries/pages, user selection/scope, and desired watch preference.

The parent remains responsive while child configuration is slow, invalid, or CPU-bound. It does not import Vite, project configuration, test engine, catalog provider, or runtime controller into its early bind graph. Terminal modules loaded before binding use only lightweight Node utilities and local DTOs. Load clipboard/QR helpers on demand; perform no startup package-resolution probe for test availability in the parent.

Parent observes proxy lifecycle and child IPC. It routes raw output through one decoder/sanitizer, records history, then writes through active terminal surface or plain reporter. Do not install a process-wide parent stdout patch: rendering, diagnostics, and child output must not recursively intercept each other.

## Child ownership

Child adapter receives private commands only for its current generation. It references canonical catalog, context, execution service, and eligibility service; it does not create another dev server, collector, queue, or MCP listener.

The adapter attaches through existing generation lifecycle callbacks. It validates target/revision, projects detached metadata, admits terminal work through a scoped execution owner, and emits bounded observations. Credentials remain private and are redacted from terminal records. A disabled MCP adapter never disables terminal operations.

Generation invalidation closes subscriptions, cancels terminal-owned jobs, joins confirmed cleanup, and stops publication. Existing session/controller still controls full runtime teardown and cancellation of its other dependents.

## Terminal state ownership

- Parent, session-lifetime (survives runtime replacement): lifecycle/generation mirror, public URLs, current phase and elapsed display, active view, search text, selection by stable ID, selected test scope, desired watch preference, log/request histories, completed test summaries and cached result pages, in-flight operation IDs (marked unavailable on retirement).
- Parent, durable preference vs. authority: watch preference and scope are parent preferences only; they confer no execution authority. Authority to run, cancel, and watch lives only in the child for its current generation.
- Child, generation-lifetime: project context, canonical catalog and revision, dependency evidence, terminal execution owner, canonical test results within retention, watch scheduler and pending affected IDs. All of it dies with the generation; parent re-requests after restart.

## Communication flow

1. Parent initializes lightweight terminal state and binds proxy.
2. Bound address is recorded/displayed before child project evaluation.
3. Child starts and emits progress/logs, catalog notifications, and session metadata.
4. Parent detail view reads revision-scoped metadata pages; stale pages are discarded and refreshed.
5. Test command returns operation identity after admission; progress/state arrive independently; result pages are fetched by exact operation identity.
6. On restart, parent retires pending child reads/actions immediately, keeps histories/preferences, and shows restart cause.
7. New generation restores desired watch scope after readiness and usable collection, rebuilding dependency evidence before running.
8. Shutdown stops input/admission first, joins runtime/proxy cleanup, restores terminal, and allows process exit. Cleanup errors set nonzero exit status.

Private transport is local IPC only. Public status SSE and `PublicState` remain browser-safe and do not gain log/test/catalog control fields.

## Planned source layout

(Now `packages/histoire-cli/src/terminal/`, see Package layout.) Under `packages/histoire/src/node/terminal/`, separate protocol/types, bridge, session, mode detection, output decoding, history, terminal surface, key handling, navigation, plain reporter, panel, platform actions, and individual views. Under `packages/histoire/src/node/runtime/terminal/`, separate adapter lifecycle, catalog projection, diagnostics, tests, affected selection, and watch scheduling.

Command handlers, views, and protocol DTOs are split per domain behind registries; exact frozen names are in [contracts](contracts.md#implementation-seams). These are responsibility boundaries, not a requirement to create empty modules. Extract shared navigation/history code once when needed. Keep existing generic utilities in their owning packages; do not duplicate wire bounds, test-summary merge, URL construction, or fixture helpers.

Proxy adds only framework-neutral optional observer/transport seams. Histoire-specific DTOs and payload validators live in Histoire. Type-only imports must remain type-only in emitted JS.

## Execution and watch

Manual and automatic runs share the current FIFO server execution lane with workbench and MCP. A terminal-scoped owner cancels only terminal submissions; cleanup completion releases the lane. For an affected subset, one batch task runs captured per-story tasks sequentially; do not enqueue inner tasks into the lane already occupied by the batch.

Watch combines previous complete dependency evidence, existing file events, and completed collection. A graph determines selection; collection readiness determines when submission is safe. Catalog notifications alone are insufficient. Preserve source-owner checks even when unrelated catalog changes conservatively invalidate an active terminal run.

Pending affected IDs are unioned across edits. Invalidated terminal work is cancelled and drained before successor admission. Keep interrupted batch's not-yet-validated targets pending, so cancellation cannot silently lose their required rerun. Refresh evidence only after successful owned analysis; retain old evidence through failures/deletions. Stop disables automatic scheduling as well as cancelling current run.

## Failure containment and compatibility

- Config/startup failure keeps parent listener and correction watcher alive.
- Render failure restores screen/input and falls back to plain reporting; it does not stop server or watch.
- Read timeout rejects a read; it does not cancel an admitted test operation. Explicit cancellation targets operation identity.
- Closed/replaced child rejects pending operations and suppresses late observations.
- Failed assertion is a completed test result. Runner/preflight/cleanup failures are separate errors; unknown cleanup retains existing quarantine behavior.
- Ordinary proxy consumers retain piping and lifecycle behavior when observers are absent.
- Fresh restart bypasses owned cache reuse for next generation without deleting another process's cache or changing later ordinary restart policy.
- Repository launcher keeps one terminal input owner; it must also exit after intentional clean child quit rather than wait for another build forever.

## Package layout

Dependency graph, no cycles: `histoire` -> `@histoire/cli` -> `@histoire/dev-proxy`. `@histoire/cli` never imports `histoire`; histoire-specific pieces are injected.

- `packages/histoire-cli` (`@histoire/cli`): Sade command definitions and help (`src/cli.ts`, `runCli(host)` with lazy command loaders), `screenshot-setup` argument validation, the dev parent (`src/commands/dev.ts`, `devCommand(options, host)`), all parent terminal code (`src/terminal/**`, including `terminal/protocol/*` and `terminal/output/sanitize.ts`), and `src/workbench-url.ts`. Subpath exports: `@histoire/cli/protocol/*`, `@histoire/cli/sanitize`, `@histoire/cli/workbench-url` (loaded lazily by the parent, so `@histoire/protocol` stays out of the bind graph). Histoire specs import parent internals by source path, never through an export.
- `packages/histoire`: runtime, server, test engine, MCP, `runtime/terminal/**` (child side), `commands/{dev-child,build,preview,test,mcp,screenshot-setup,visual}.ts`. `src/node/bin.ts` calls `runCli` with the loaders; `commands/dev-host.ts` is the light injection of the dev parent (`runtime` child entry URL, `captureMcpToken`, `resolveDevMcpOptions`) and must stay in the early bind graph rules below.
- Frame/ID bounds come from `@histoire/dev-proxy/protocol` (`RUNTIME_FRAME_MAX_BYTES`, `RUNTIME_ID_MAX_LENGTH`, `isIdentifier`, `isBoundedFrame`); `terminal/protocol/core.ts` derives from them.
- Older path references in this pack (`packages/histoire/src/node/terminal/`, `node/bin.ts`, `commands/dev.ts`) predate the split; read them as the paths above.
