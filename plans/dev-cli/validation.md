# Dev CLI validation

Status: **planned**. Commands below are implementation gates, not recorded passes. See [evidence](evidence.md) for executed checks and [contracts](contracts.md) for expected behavior.

## Test boundaries

Use real owned algorithms for bounded history, selection, and scheduling, and real shipped command/process/browser paths for interaction and lifecycle claims. Do not mock Histoire controller, execution queue, collector, catalog, test runner, or terminal command wiring. External services/platform browser/clipboard boundaries may be controlled, but describe exactly what is substituted and what remains unverified.

Before meaningful regression, record entry/boundary, user contract, plausible defect, distinguishing input, public oracle, and cleanup lifetime. Reuse existing helpers under `packages/histoire/src/node/__tests__/utils/mcp/`: `cli-project.ts`, `browser-test-project.ts`, `process.ts`, `dev-launcher-project.ts`, plus packed-consumer helper under `utils/package-consumer.ts`. They are reuse seams, not frozen source; several are concurrently edited.

Pure/process specs live under `packages/histoire-cli/src/__tests__/` (parent-only code) and `packages/histoire/src/node/__tests__/terminal/` (child-side code and process specs). `packages/histoire/vitest.terminal.config.ts` runs `terminal/integration/**/*.spec.ts`; the core config excludes these expensive PTY/browser specs. Existing MCP config includes only `mcp/integration`, so new specs are not automatically covered by it. Keep existing integration/packaging regressions in their owning configs.

Use one reusable PTY harness under `packages/histoire/src/node/__tests__/utils/terminal/`, invoking actual built CLI and optionally existing launcher. Linux harness can use test-only Python `pty`/`termios` adapter; no production native binding. Check prerequisites before run, report unsupported infrastructure, never count skipped PTY as successful integration proof. Bound acquisition, events, shutdown, logs, and output. Track child handles independently and always join cleanup, even after assertion failure.

## Acceptance matrix

- **Output/IPC:** real child emits console and direct stream records, split UTF-8 and partial/huge lines; no loss except explicit bounds; generation replacement rejects pending reads and late replies cannot revive them. Default proxy consumer still pipes.
- **Early bind/progress:** hold real configuration through external HTTP gate; public startup page responds before release. Observe real phases/restart cause. Bad config remains recoverable at same public URL.
- **Mode/input:** PTY proves default activation, overrides, resize fallback/recovery, key/search routing, quit, suspend/resume where supported. Piped CLI has no TUI cursor-control sequences; input reader does not keep it alive after close.
- **Logs/info:** distinct old/new errors survive correction, scroll/follow/search/selection remain stable, retention bounds omit oldest, copied content is sanitized, clipboard failure preserves URL.
- **Catalog:** two independent stories and variants, large paged inventory, base/hash routes and unusual IDs. Revision change during paging cannot mix results; deleted targets cannot run/open; `--no-mcp` still works.
- **Requests:** real success/failure/abort/startup request; same response status/body with observer on/off, record completes once, secret query/header/body absent, SSE/internal assets omitted.
- **Tests:** actual project browser tests with known passed/failed/skipped counts and uncollected story; whole/story/variant targets; terminal/MCP/workbench serialization; owner-specific cancellation; cleanup-gated successor; missing dependencies do not install or exit dev server.
- **Affected selection:** A-only edit, A/B shared dependency, unrelated C, shared setup, deleted import, opaque module, structural change, ignored cache output. Assert exact membership, including excluded targets.
- **Watch:** assertion-only edit without changed story metadata; held active run plus two rapid affected edits; interrupted batch targets not lost; one coalesced successor; config failure/recovery keeps URL/scope; removed variant pauses; no generated-output loop; plain flag works.
- **Launcher/package:** actual repository launcher passes input and config paths with spaces, source mode survives rebuild, clean quit ends supervisor, rebuild restarts child; unrelated packed consumer resolves every shipped module/dependency.
- **Cleanup:** parent/runtime/test worker exit, no stale callbacks, old listeners/screen state restored, exact listener port binds again. Successful method calls alone are insufficient.

No tests for decorative classes/styles or giant render snapshots as proof of behavior. Manual inspection covers appearance; PTY tests assert meaningful labels/actions, selection, results, and terminal restoration.

## Feature and edge-case ownership

Decisive check types: U unit (real algorithm), P process (built CLI/IPC), T PTY, B browser tests, K package, M manual.

- Early bind, occupied port, exact URL after correction, old PID gone before new generation, bad config recovery: 01/02, P (baseline `dev-command-lifecycle.spec.ts`).
- Output decoding (split UTF-8, partial/huge lines, CR updates, sanitization, credential redaction), bounded retention, generation fence for late replies, default piping unchanged: 01, U + P.
- Phases, counts, elapsed, failed phase visible, restart cause (manual/config/exit/browser/fresh), coalesced fresh not lost, fresh bypasses cache once: 02, P.
- Mode policy (flag/env/auto, CI, inspector, size), resize fallback/recovery, renderer failure, plain commands, input lifetime, suspend/resume, shutdown restore: 03, U + T (+ M for platforms).
- Logs/errors search, follow, selection by stable ID, clear vs delete, clipboard failure, QR, session info: 04, U + T.
- Catalog paging, revision change mid-page, large inventory, unusual IDs, deleted target, base/hash URLs, `--no-mcp`: 05, U + P + T.
- HTTP request records (query stripped, aborts, SSE/internal excluded, byte-identical responses), runtime/MCP diagnostics: 06, P.
- Test admission, queue full/unavailable, cleanup-gated successor, owner-scoped cancel, result paging/retention, assertion failure vs runner failure, missing deps: 07, U + B.
- Tests view scopes, failure filter, stop disables watch, disabled scopes: 08, T + B.
- Affected selection (A-only, shared, unrelated, setup, deleted import, opaque, structural, cache output): 09, U + B.
- Watch (coalescing, interrupted batch carry, collection barrier, restart recovery, removed target pause, no loops, `--test-watch` plain): 10, U + P + B.
- Launcher stdin ownership, spaced paths, source mode, clean quit, rebuild restart, packed consumer, docs, platform matrix: 11, P + K + M.

## Baseline and scoped commands

Run from repository root unless `--dir` is supplied. During slice 00 record exact selected checks and preexisting failures; do not run complete browser matrix just to author plans.

```bash
git rev-parse HEAD
git status --short
pnpm --filter @histoire/dev-proxy test
pnpm --filter histoire exec vitest run src/node/__tests__/mcp/dev-command-lifecycle.spec.ts
```

Build packages before installed-equivalent process tests when sources change. Build scripts replace package `dist`; coordinate with other active consumers rather than rebuilding blindly in shared checkout.

```bash
pnpm --filter @histoire/dev-proxy build
pnpm --filter @histoire/cli build
pnpm --filter histoire build
pnpm --filter @histoire/cli test
pnpm --filter histoire exec vitest run src/node/__tests__/terminal
pnpm --filter histoire test:terminal
```

Do not run `test:dev` as a finite gate; it enters watch mode.

Existing regression gates:

```bash
pnpm --filter histoire exec vitest run --config vitest.mcp.config.ts src/node/__tests__/mcp/integration/dev-proxy-browser.spec.ts src/node/__tests__/mcp/integration/dev-launcher.spec.ts src/node/__tests__/mcp/integration/execution.spec.ts
pnpm --filter histoire test:mcp:package
```

Slice 11 adds terminal packed-consumer scenario to existing package gate rather than assuming current smoke exercises new TUI. Ensure built packages and browser dependencies exist before invoking these expensive tests. For broader type checks use affected package builds or their existing no-emit compiler invocation, recording preexisting failures separately. No need to modify app styles or rebuild every unrelated package unless dependency changes require it.

Run scoped ESLint on actual changed source/config/test files without `--fix`, then `git diff --check`. Include untracked new files in whitespace/link inspection without staging them. Plan Markdown verification checks local links, numbered documents/dependencies, required sections, planned statuses, and absent fabricated receipts.

## Manual platform matrix

- Linux terminal: wide/narrow, resize, light/dark, Unicode, plain output, keyboard navigation, browser/clipboard, suspend/resume, config recovery, watch, quit, repository launcher.
- macOS terminal: same runtime interactions, clipboard/browser launch, suspend/resume, restoration.
- Windows terminal: raw input, Ctrl+C, resize, clipboard/browser, process-tree shutdown, launcher rebuild/quit. Do not extrapolate Unix signals or PTY results.
- Multiplexer/remote shell: verify retained history and fallback without requiring local clipboard/browser availability.
- CI/pipes: plain default, explicit opt-in still needs capable TTY, no hanging stdin or terminal escapes.

Record terminal/OS/Node version and exact observed scenarios. Linux-only automated evidence cannot claim macOS/Windows support verified.

## Fault sensitivity

In isolated copies/private caches only, probe: remove generation fence, select first affected story only, trigger watch only on changed catalog metadata, and release queue before cleanup. Correct baseline must pass; each injected fault must cause meaningful protected assertion to fail. Syntax/import errors, unrelated setup failures, or unspecified timeout alone are not successful probes. Never alter shared source or dependency tree for a probe.

## Receipt and final gate

Receipt fields: slice, source HEAD/dirty paths, changed paths, deviations, commands, result/proof boundary, fixture/platform prerequisites, fault probes, limitations, next-slice readiness. Record unit/process/PTY/browser/package/manual/CI evidence separately.

Complete milestone only after all slice gates, real CLI workflow, existing lifecycle/browser regressions, launcher, packed consumer, affected builds/type checks, lint, and whitespace pass or precise outstanding blockers are reported. No remote CI, publication, commit, or push is implied.
