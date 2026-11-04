# 08 — Tests view and manual actions

Status: **complete** (2026-11-04, see evidence). Dependencies: [03](03-terminal-surface-and-modes.md), [04](04-logs-errors-and-session.md), [05](05-story-browser.md), [07](07-test-execution-service.md).

## Goal

Run and inspect whole-book, story, and variant browser tests through actual terminal while dev server remains usable.

## Source targets

- `packages/histoire/src/node/terminal/` tests view/state, scope selection, result navigation, panel status, plain reporter/commands.
- Existing story-browser target handoff and runtime test service from 07.
- Real PTY/browser fixtures under terminal integration suite.

## Implementation steps

1. Add `t` view entry. Initial scope All; `t` from story browser sets exact selected story/variant. Left/right chooses available All/Story/Variant scope; unresolved/deleted target cannot be selected/run.
2. Enter submits current scope via service. Show queued immediately after admission and update from operation identity/generation. Disable duplicate Enter admission while own operation is active; no blind replay after timeout.
3. Display collection/run progress separately, passed/failed/skipped totals, uncollected stories, and terminal operation errors. Running tests does not replace server lifecycle state.
4. Reuse list/search/detail/copy behavior for results. Add `f` failure filter and completed-run selection using stable IDs. Page results and expose omissions/expired detail explicitly; preserve summary counts independently of loaded pages.
5. `s` cancels terminal operation; wire eventual watch-stop callback so 10 can disable scheduling too. Cancellation remains visible until cleanup completes. User may start new manual work only when adapter admission permits it.
6. Retain historical summaries across edit/restart; label old generation/revision as historical. Do not merge old cases into fresh result or show them as current success.
7. Plain `tests` submits current scope, initially All; `stop` cancels owned work. Print decisive progress/summary/failure text without alternate screen or raw input. Add no fake watch action before 10.
8. Scope/target mutation is explicit; browsing another story does not silently alter existing scope or operation.

## Useful tests

- PTY selects story B/variant two from two-story fixture, runs it, and observes independent expected result while unrelated test-body marker remains absent.
- All run shows expected counts, skipped cases, uncollected story, and named failure detail; server responds after assertions fail.
- Stop held run, await cancelled state/cleanup, then run another target successfully.
- Change source/restart after completion: old result stays historical; new run cannot inherit old success.
- Missing dependency/busy error appears while session and later actions remain usable. Plain command path executes actual tests, not only helper wiring.

## Acceptance criteria

Actual CLI provides manual test scope/run/stop/results workflow. TUI and interactive plain output both reflect real operation completion and do not exit on assertion failure.

## Exclusions

No automatic watch/rerun, target edit commands, snapshot approval, browser launch per selected test case, or presentation-only assertions.

## Handoff receipt

Record PTY action sequence, exact executed targets/counts/body markers, cancellation recovery, plain command proof, and failure display limits in [evidence](evidence.md). 10 extends these controls without introducing second operation model.
