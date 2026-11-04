# Dev CLI contracts

Status: **planned**. These decisions govern all slices. Existing protocol identifiers are preserved. Private terminal types are additive; no new browser SDK or MCP API is required.

## Activation and flags

Add `tui?: boolean` and `testWatch?: boolean` to CLI dev inputs. Expose `--tui`, `--no-tui`, `--test-watch`; leave unrelated commands unchanged.

Resolve mode in this order: explicit TUI flag; `HISTOIRE_TUI=plain|auto|1`; automatic policy. Unset env is `auto`; unsupported nonempty values produce a concise invalid-option error before project evaluation. Use Sade's normal handling for repeated boolean options rather than adding a second parser.

Automatic mode requires TTY stdin/stdout, usable raw input, non-dumb terminal, at least 40 columns and 10 rows, no CI, and no attached/enabled Node inspector. Detect inherited inspector settings as well as CLI process state. Explicit enable can override CI/inspector checks, but not missing terminal capabilities or dimensions. Explicit disable always wins over environment enable.

On resize below minimum, leave detail screen, restore input/cursor, and use plain reporter. Preserve session state/history/watch preference; restore TUI on recovery if policy permits. A renderer failure falls back for remainder of session to avoid repeated failing repaints. Unix suspend releases terminal state; resume redetects mode. Do not claim this proves Windows behavior.

Plain output preserves `Histoire:`, `Local:`, `MCP:` address discovery lines. It emits no TUI control sequences. Interactive plain mode reads newline-terminated commands; noninteractive stdin installs no reader. Existing `--open`, binding/port fallback, config paths, MCP policy, and stable URL behavior remain intact.

## Main screen and views

Main panel uses normal screen with logs above pinned status. Detail views use alternate screen. Show Histoire/version, actual public URLs, lifecycle/progress/elapsed time, story/variant counts, test/watch activity, and fitting shortcuts. Unknown totals never become fabricated percentages. Use Histoire identity, English labels, subtle backgrounds/inverse selection, and no decorative colored borders/edge bars.

Main keys: `r` restart; `R` fresh restart; `o` open workbench; `y` copy URL; `i` session info; `l` logs; `e` latest error; `n` requests; `p` stories; `t` tests; `c` clear visible output; `x` delete retained log/request history; `?` help; `q` quit. `x` does not stop tests/watch or delete completed test results.

Detail views: arrows, Page Up/Down, Home/End; `/` search; Enter activate/inspect; `y` copy selected; `Y` copy filtered contents. `Esc` or `q` returns to main. `Ctrl+C` always quits, even during search. Search consumes printable action keys; Enter applies, Esc cancels. Scrolling pauses follow; End resumes follow in append-only histories. Preserve selection by stable ID, never by stale array offset.

Stories view: Enter story lists variants; Enter variant opens workbench target. `o` opens selected story/variant using canonical URL builder; `t` opens Tests and selects exact target. Explicit deletion clears actionability; restart may retain ID as unresolved selection until new catalog confirms it.

Tests view: left/right selects available All/Story/Variant scopes, Enter runs, `w` toggles watch, `s` stops terminal work and disables watch, `f` toggles failures filter. Scope options requiring a missing target are disabled. Ordinary view navigation does not retarget an existing watch; changing test scope is explicit.

Interactive plain commands: `help`, `restart`, `restart fresh`, `open`, `tests`, `watch`, `stop`, `quit`. `tests` uses current scope, initially All; `watch` toggles current scope. Detailed target selection is through TUI; add no speculative CLI story-filter flags. `--no-tui --test-watch` starts whole-book watch without requiring input.

## Lifecycle, progress, and fresh restart

Preserve `starting | ready | restarting | failed | closed`. Availability and active test operation are separate. A failed assertion never sets server lifecycle to failed.

Progress identifies generation, phase, start/completion, monotonic elapsed duration, optional current/total counts, optional plugin/file label. Phases describe actual config, Vite acquisition, scans, hooks, collection/restoration, warmup, service attachment. Failed phase remains visible; superseded progress cannot advance successor.

Restart cause distinguishes manual, config/dependency edit with source label, runtime exit, browser-requested restart, fresh restart. Fresh restart waits for existing winddown, bypasses catalog restoration and forces dependency optimization for next acquired generation only. Coalesced fresh request must not be lost to an ordinary pending restart. Do not recursively delete project caches, baselines, generated plugin data, or another context's directories.

## Private IPC and paging

Extend current transport with generic `runtime-command`, `runtime-reply`, and `runtime-event` variants. All carry existing generation identity; commands/replies carry correlation ID. Payload contains a recognized Histoire operation and detached JSON data. Keep validation/size limits lightweight in proxy; Histoire validates operation-specific arguments/results. Reuse bounded wire utilities where import graph permits, without weakening existing limits or importing runtime graph into parent.

Frozen numeric bounds (slice 01 implements, later slices must not exceed): every `runtime-*` frame is at most 256 KiB of serialized JSON; correlation/operation/target IDs at most 100 characters; at most 32 pending parent reads per generation (excess rejects immediately as busy); a single structured log event text at most 16 KiB with visible truncation. `isChildMessage` in `histoire-dev-proxy/src/protocol.ts` is extended with the new variants; unknown `type` values stay rejected. Parent-side command senders live in Histoire, not in the proxy.

Histoire commands: `catalog.list`, `catalog.variants`, `session.get`, `tests.run`, `tests.get`, `tests.results`, `tests.cancel`, `watch.set`. Child events: structured logs, progress, catalog revision, diagnostics/session updates, test state/progress, and watch state. Unsupported commands fail explicitly; no arbitrary function, shell, file read, or project-switch operation.

Catalog reads page at most 100 items, carry expected revision after first page, and return revision plus continuation. Variants page independently so one large story does not force an unbounded message. Test result pages address exact operation plus cursor and at most 100 cases. Apply serialized-byte bounds as well as item counts; an individually oversized entry gets an explicit bounded unavailable/truncated representation. Preserve aggregate counts and failure discoverability.

Read timeout defaults to 10 seconds; pending reads settle immediately on retirement/disconnect. Test admission responds with operation ID promptly, not after browser completion. A timeout never means admitted work was cancelled; no automatic retry of a timed-out test submission. Stale catalog pages restart a read, never silently mix revisions. IDs are opaque and unique within parent session; generation is checked independently.

Do not send terminal details through public status SSE or `PublicState`. Public HTTP requests cannot invoke this private command channel. Keep MCP credential out of environment and project config as existing implementation does.

## Retention and output

Logs retain at most 2,000 entries and 2 MiB of sanitized UTF-8 text; requests retain 500 entries; completed test histories retain 20 runs and 8 MiB of summaries/fetched result data per owner. Child canonical result retention and parent display cache are each bounded; neither grows to fit whole book. Active operations retain only bounded progress/metadata and cannot be evicted as completed results. If full result exceeds retention budget, preserve aggregate counts, explicit omission, and bounded failures instead of failing an already-executed run and encouraging automatic replay.

Evict oldest completed entries; expose omission/truncation counts. Histories have stable increasing session IDs. Parent preserves log/request histories and completed test summaries across runtime replacement. Cached old result pages remain historical; unfetched pages from retired child become explicitly unavailable. Parent cannot reexecute a test to reconstruct evicted results.

Decode split UTF-8 with streaming decoder; flush final partial line on stream end. Carriage-return updates replace current unfinished line. Bound oversized unfinished lines, preserve visible truncation, and continue draining stdout/stderr. Sanitize before retention and copy: remove terminal controls, preserve ordinary newline/tab text, redact configured credential. Renderer supplies its own styling. Console interception suppresses duplicate raw echo only for intercepted calls, restores only owned hooks, and never drops direct stream writes.

Request record: stable ID, method, pathname, status when available, completed/failed/aborted outcome, duration. Strip query before retention. No headers, cookies, bodies, authorization, or invented log/request correlation. Exclude proxy status stream and its own loading assets; include forwarded assets and normal application requests. WebSocket upgrades are outside HTTP history scope.

## Test execution and watch

Tests use project browser-mode Vitest via existing isolated runner and shared FIFO lane. No automatic dependency installation, raw Vitest argument forwarding, snapshot update action, or native persistent Vitest watch. Unavailable dependencies show existing actionable preflight error.

Initial test scope is All. Story/variant selections use exact IDs. Terminal-scoped owner cancels only its submissions. Affected batch occupies one shared lane submission and calls existing captured per-story tasks sequentially inside it; never enqueue nested work into occupied lane. No cleanup or validation checks are skipped. Queued/full/unavailable/cleanup failures remain explicit.

An assertion failure yields completed result with failed counts; runner failure yields failed operation; cancellation remains cancelling until cleanup finishes. Capture runtime/revision at admission and revalidate before execution/publication. Preserve summary identity and current task-result serialization. Terminal result display never changes global process exit status for failed assertions; shutdown cleanup failure does.

Watch starts off unless requested, and enabling runs initial selected scope after evidence/collection readiness. File evidence selects affected stories; shared setup affects selected scope. Structural/resolution changes and unknown graph portions conservatively affect selected scope. Known unrelated modules produce no run. Preserve old complete graph through deletion/rebuild; membership is not forgotten before change is classified.

Coalesce affected IDs while collection or execution is active. Wait for real completed usable collection, not only changed metadata. Carry interrupted batch's pending targets through cancellation; wait for confirmed cleanup before successor. Unchanged cache revalidation is not an edit. Generated output cannot trigger loops. Removed selected target pauses watch without broadening; infrastructure/collection failure waits for explicit action or meaningful source recovery rather than retrying indefinitely. Parent preference survives restart; new generation verifies IDs, rebuilds evidence, and runs retained scope once after recovery.

## Shutdown and launcher

Stop admission/input before awaiting teardown; close alternate screen, restore raw mode/cursor, detach owned listeners/timers, and close proxy/runtime once. Preserve unrelated listeners and preexisting terminal state. Signals and `q` use same graceful path. Unexpected renderer failure affects rendering only.

Repository Nodemon integration uses inherited stdin and quiet supervisor output while retaining build watches/delay/source mode. Intentional clean child quit ends launcher; supervised rebuild termination continues restart behavior. Do not kill an unknown parent PID or treat every clean supervised shutdown as intentional quit.

## Implementation seams

Fixed so later slices add behavior in separate files without editing each other's modules. Slices 01 and 03 create the registries; every later slice only adds one module plus one registration line. Names below are the frozen layout; slices may add siblings but not move these.

### Child command handlers (`packages/histoire/src/node/runtime/terminal/`)

- `adapter.ts` (slice 01) owns generation lifecycle: attaches through `onGeneration`/`onBeforeRelease` of `createDevSession`, creates the terminal-scoped execution owner (`createExecutionOwner(session.execution)`), validates `runtime-command` frames, and replies/emits. It dispatches only through a registry; it contains no per-domain `switch`.
- `registry.ts` (slice 01) exports `TerminalCommandHandler` (`{ operation: string, handle(args, context) => Promise<detached JSON> }`), `TerminalHandlerContext` (generation handle, canonical catalog, execution owner, event emitter, signal) and `createCommandRegistry(handlers)`. Unknown operation fails explicitly with the contracted unsupported error; duplicate registration throws at startup.
- `handlers/index.ts` is the only shared list: one import and one array entry per module. Handler modules: `handlers/catalog.ts` (05: `catalog.list`, `catalog.variants`), `handlers/session.ts` (04/06: `session.get` and diagnostics), `handlers/tests.ts` (07: `tests.run|get|results|cancel`), `handlers/watch.ts` (10: `watch.set`). Each owns its operation namespace, its argument validators, and its own event emission through the context emitter. Handlers do not import each other; shared helpers go in a new module used by both.

### Parent views (`packages/histoire-cli/src/terminal/`)

- `views/registry.ts` (slice 03) exports `TerminalView` (`{ id, shortcut, title, enter/handleKey/render, ... }`) and `registerView`/`createViewRegistry`. The registry is keyed by main-screen shortcut and rejects duplicate shortcuts or ids; the main-key table in this document is the authority (`i` session, `l` logs, `e` error, `n` requests, `p` stories, `t` tests, `?` help).
- `views/index.ts` is the only shared list: one import and entry per view. View modules: `views/session.ts`, `views/logs.ts`, `views/error.ts` (04), `views/stories.ts` (05), `views/requests.ts` (06), `views/tests.ts` (08). A view reads its domain from its own history/state module and sends commands through the bridge; views never import each other. Shared navigation/search/selection helpers live once under `navigation/` (slice 03/04).
- `bridge.ts` exposes `send(operation, args, { timeout })` generic over the DTO map; per-domain typed wrappers sit beside their view/state module, not in the bridge.

### Protocol DTOs (`packages/histoire-cli/src/terminal/protocol/`, imported by the child as `@histoire/cli/protocol/*`)

- One file per domain: `core.ts` (envelope, generation/correlation IDs, error shapes, page/cursor types, bounds constants, 01), `catalog.ts` (05), `session.ts` (04/06 session and diagnostics DTOs), `requests.ts` (06 HTTP records), `tests.ts` (07), `watch.ts` (10). `protocol/index.ts` only re-exports with `export type`; domain files import `core.ts` and never each other. Operation-name to argument/result maps are declared per domain and merged by a single type union in `index.ts`.
- DTO modules are type-and-constant only (no runtime imports beyond `node:`-free constants and validators) so the parent early bind graph stays light. Operation-specific validators live next to their DTOs and are used by the matching handler in `runtime/terminal/handlers/`.
- Proxy `protocol.ts` carries only the generic `runtime-command|reply|event` envelope (payload `unknown`, recognized `operation: string`), per the IPC section above.

### Ownership rule for parallel slices

A slice may edit only its own handler, view, DTO and state modules, its tests, and one-line registration entries in `handlers/index.ts`/`views/index.ts`. Core files (`adapter.ts`, `registry.ts`, `views/registry.ts`, `protocol/core.ts`, proxy `protocol.ts`) change only in the slice that creates them, or by an additive, explicitly reported edit.
