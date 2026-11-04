# Dev CLI slice plans

Status: **implemented, Linux-qualified** (2026-11-04; macOS/Windows/multiplexer matrix outstanding — see [evidence](evidence.md#final-conformance)). Planned 2026-11-03 on baseline `bfae3c4d03aa6a644ada0f1b7327e31ad218bb83`; implemented on `afd4ea6e` as uncommitted changes. No commit, push, publication, or CI result is claimed.

## Goal

Give `histoire dev` an interactive terminal experience modeled on [Nuxt CLI v4, released alongside Nuxt 4.6](https://github.com/nuxt/cli/releases/tag/v4.0.0), adapted to Histoire: a pinned status panel, startup progress, keyboard actions, browsable logs/errors, stories/variants, HTTP requests, session diagnostics, and browser tests with affected-story watch.

User selected full console, automatic activation, Histoire identity with Nuxt layout, all/story/variant test actions, affected-story watch, and both a watch shortcut and CLI flag. Those decisions apply to the complete milestone; an early usable console does not replace later slices.

## Read first

1. [Architecture and current seams](architecture.md).
2. [Locked behavior and interfaces](contracts.md).
3. [Validation and acceptance](validation.md).
4. [Evidence ledger](evidence.md), initially without execution receipts.

## Locked decisions

- Automatic TUI in capable terminals; `--tui`, `--no-tui`, and `HISTOIRE_TUI=plain|auto|1`. Explicit flag wins.
- `--test-watch` is off by default and initially watches the whole book.
- Normal-screen pinned panel; alternate-screen detail views; restrained Histoire colors/backgrounds. No decorative colored borders or accent edge bars.
- Test scopes are whole book, story, or variant. Watch reruns affected stories; incomplete evidence conservatively reruns selected scope.
- Parent owns terminal, public listener, session histories/preferences, and process lifecycle. Child owns project context, catalog, dependency evidence, and test work.
- Extend existing proxy and private IPC. Full terminal functionality works with `--no-mcp`; add no public terminal-control HTTP endpoint.
- Reuse existing runtime catalog, URL builder, dependency evidence, test task, summaries, isolated runner, and shared execution queue.
- Server-side HTTP summaries and runtime diagnostics only. Browser console, outgoing browser fetch tracing, request timelines, session takeover/locks, plugin terminal API, and native Vitest watch are excluded.

## Ordered slices

Every slice starts **planned**. Execute sequentially; dependency lists identify technical prerequisites, not authorization to delegate or edit shared files concurrently.

1. [00 — Baseline, contracts, and acceptance](00-baseline-and-contracts.md). No dependency. Reconcile current sources and establish observable gates.
2. [01 — Runtime bridge and output ownership](01-runtime-bridge-and-output.md). Requires 00. Generation-scoped communication and complete bounded output handling.
3. [02 — Progress and restart reasons](02-progress-and-restart-reasons.md). Requires 01. Real startup phases, collection counts, restart causes, and fresh restart.
4. [03 — Terminal surface and modes](03-terminal-surface-and-modes.md). Requires 01–02. Pinned panel, input lifetime, fallback, shutdown, and PTY harness.
5. [04 — Logs, errors, and session](04-logs-errors-and-session.md). Requires 03. Search/navigation/history, clipboard, QR, session information.
6. [05 — Story browser](05-story-browser.md). Requires 01, 03, 04. Revision-safe catalog browsing and exact target URLs.
7. [06 — Requests and diagnostics](06-requests-and-diagnostics.md). Requires 02–04. Non-invasive HTTP observation and runtime/MCP summaries.
8. [07 — Test execution service](07-test-execution-service.md). Requires 01–02. Scoped ownership on existing queue, finite browser runs and results.
9. [08 — Tests console](08-tests-console.md). Requires 03–05, 07. Manual all/story/variant workflows and failure inspection.
10. [09 — Affected-story selection](09-affected-story-selection.md). Requires 05, 07. Existing dependency evidence selects safe subsets.
11. [10 — Test watch](10-test-watch.md). Requires 02, 07–09. Coalescing, cancellation, collection barriers, restart recovery.
12. [11 — Launcher and conformance](11-launcher-and-conformance.md). Requires 00–10. Repository launcher, packed consumer, docs, complete qualification.

Slices 00–03 establish the console foundation; 04–06 complete inspection; 07–10 complete tests/watch; 11 qualifies delivery. All remain required.

## Starting state and concurrent work

At planning time the checkout already contains unrelated tracked/untracked edits across workbench plugins, accessibility, protocol/shared test data, browser test collection/progress/timeouts, fixtures, and docs. In particular, test execution/service/worker files and MCP browser/launcher fixtures are dirty. `.claude/` is unrelated. Treat these as existing work; this pack does not claim their authorship or validation.

Recheck `git status --short` and reread shared files before each implementation slice. HEAD is a reference, not a complete snapshot of dirty source. Do not reset, clean, replace directories, revert changes, stage, unstage, commit, or push. Adapt additions to current source rather than restoring the planning baseline.

## Working and completion rules

- Keep new source modules under 300 lines; documentation is exempt. Add JSDoc to introduced functions, classes, properties, and interfaces; explain complex lifecycle logic.
- Follow repository English-copy guidance. Do not introduce visible “preview” terminology; preserve existing technical identifiers and authored story content.
- Reuse production helpers and fixtures before introducing alternatives. Tests must protect behavior, not styles, class names, source substrings, or calls to mocked internal implementations.
- Add useful failing tests before implementation where practical. Each slice runs its focused checks; final qualification alone waits for 11.
- For every completed slice, append a receipt to [evidence.md](evidence.md): source state, paths, deviations, exact commands/results, proof boundary, limitations, and next-slice readiness.
- Mark complete only after its acceptance gate is demonstrated. Unit, process, PTY, browser, package, manual-platform, and CI evidence remain distinct.
- Full work is incomplete until 11 passes or concrete outstanding blockers are recorded. Do not represent an unrun check or unavailable platform as passing.
